#!/usr/bin/env python3
"""Ingest C++ audio-programming textbooks into Milvus for hybrid RAG.

PDF -> structure-aware chunks (TOC headings + pages) -> dense (Ollama
nomic-embed-text, 768) + sparse (Milvus built-in BM25) -> collection
`books_cpp_audio` on the local Milvus standalone (localhost:19530).

Re-runnable: drops + recreates the collection (idempotent full rebuild).
"""

import json
import pathlib
import re
import sys
import time
import urllib.request

import fitz  # PyMuPDF
from pymilvus import DataType, Function, FunctionType, MilvusClient

BOOKS_DIR = pathlib.Path(
    "/Volumes/Projects/Development_Projects/Github_Repos/element/docs/training_data/"
    "Cpp Audio Programming Text books"
)
MILVUS = "http://localhost:19530"
OLLAMA = "http://127.0.0.1:11434"
EMBED_MODEL = "nomic-embed-text"
DIM = 768
COLLECTION = "books_cpp_audio"
CHUNK_CHARS = 3600          # ~900 tokens
OVERLAP_CHARS = 400
EMBED_BATCH = 32
INSERT_BATCH = 128

SHORT_NAMES = {
    "Audio Effects.pdf": "Audio Effects (Reiss & McPherson)",
    "Designing Audio Effect Plugins in C++ For AAX, AU, and VST3 with DSP Theory by.pdf":
        "Designing Audio Effect Plugins in C++ (Pirkle)",
    "The.Audio.Programming.Book.by.Richard.Boulanger.and.Victor.Lazzarini.pdf":
        "The Audio Programming Book (Boulanger & Lazzarini)",
}


def sanitize(text: str) -> str:
    """Collapse token-bombs from PDF extraction (TOC dot-leaders, char runs,
    excess whitespace) that blow past the embed model's context window."""
    text = re.sub(r"\.{4,}", " … ", text)
    text = re.sub(r"([^\w\s])\1{5,}", r"\1\1\1", text)  # any long symbol run
    text = re.sub(r"[ \t]{3,}", "  ", text)
    return text


def toc_heading_for_page(toc, page_no):
    """Most recent TOC entry at or before page_no (1-based)."""
    best = ""
    for _level, title, pg in toc:
        if pg <= page_no:
            best = title.strip()
        else:
            break
    return best


def extract_chunks(pdf_path: pathlib.Path):
    doc = fitz.open(pdf_path)
    book = SHORT_NAMES.get(pdf_path.name, pdf_path.stem)
    toc = doc.get_toc() or []
    chunks = []
    buf, buf_start_page = "", 1
    for i in range(doc.page_count):
        page_text = sanitize(doc[i].get_text("text"))
        if not page_text.strip():
            continue
        if not buf:
            buf_start_page = i + 1
        buf += page_text + "\n"
        while len(buf) >= CHUNK_CHARS:
            cut = buf.rfind("\n", CHUNK_CHARS - 600, CHUNK_CHARS)
            cut = cut if cut != -1 else CHUNK_CHARS
            piece = buf[:cut].strip()
            if piece and piece.count("…") <= 12:  # skip TOC/index dot-leader pages
                chunks.append({
                    "text": piece,
                    "book": book,
                    "page": buf_start_page,
                    "heading": toc_heading_for_page(toc, buf_start_page)[:500],
                })
            buf = buf[max(cut - OVERLAP_CHARS, 0):]
            buf_start_page = i + 1
    if buf.strip():
        chunks.append({
            "text": buf.strip(),
            "book": book,
            "page": buf_start_page,
            "heading": toc_heading_for_page(toc, buf_start_page)[:500],
        })
    doc.close()
    return chunks


def embed(texts):
    req = urllib.request.Request(
        f"{OLLAMA}/api/embed",
        data=json.dumps({"model": EMBED_MODEL, "input": texts,
                         "truncate": True}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())["embeddings"]


def build_collection(client: MilvusClient):
    if client.has_collection(COLLECTION):
        client.drop_collection(COLLECTION)
    schema = client.create_schema(auto_id=True, enable_dynamic_field=False)
    schema.add_field("id", DataType.INT64, is_primary=True)
    schema.add_field("text", DataType.VARCHAR, max_length=20000,
                     enable_analyzer=True)
    schema.add_field("dense", DataType.FLOAT_VECTOR, dim=DIM)
    schema.add_field("sparse", DataType.SPARSE_FLOAT_VECTOR)
    schema.add_field("book", DataType.VARCHAR, max_length=200)
    schema.add_field("page", DataType.INT64)
    schema.add_field("heading", DataType.VARCHAR, max_length=512)
    schema.add_function(Function(
        name="bm25", function_type=FunctionType.BM25,
        input_field_names=["text"], output_field_names=["sparse"],
    ))
    index_params = client.prepare_index_params()
    index_params.add_index(field_name="dense", index_type="AUTOINDEX",
                           metric_type="COSINE")
    index_params.add_index(field_name="sparse",
                           index_type="SPARSE_INVERTED_INDEX",
                           metric_type="BM25")
    client.create_collection(COLLECTION, schema=schema,
                             index_params=index_params)


def main():
    client = MilvusClient(MILVUS)
    pdfs = sorted(BOOKS_DIR.glob("*.pdf"))
    if not pdfs:
        sys.exit(f"no PDFs in {BOOKS_DIR}")

    all_chunks = []
    for p in pdfs:
        t0 = time.time()
        cs = extract_chunks(p)
        all_chunks.extend(cs)
        print(f"extracted {len(cs):5} chunks  {p.name[:60]}  ({time.time()-t0:.1f}s)",
              flush=True)

    build_collection(client)
    print(f"collection {COLLECTION} created; embedding {len(all_chunks)} chunks…",
          flush=True)

    t0, done, rows = time.time(), 0, []
    for i in range(0, len(all_chunks), EMBED_BATCH):
        batch = all_chunks[i:i + EMBED_BATCH]
        vecs = embed([c["text"] for c in batch])
        for c, v in zip(batch, vecs):
            rows.append({"text": c["text"][:20000], "dense": v,
                         "book": c["book"], "page": c["page"],
                         "heading": c["heading"]})
        done += len(batch)
        if len(rows) >= INSERT_BATCH:
            client.insert(COLLECTION, rows)
            rows = []
        if done % 512 < EMBED_BATCH:
            rate = done / (time.time() - t0)
            eta = (len(all_chunks) - done) / max(rate, 1e-9)
            print(f"  {done}/{len(all_chunks)}  {rate:.1f} chunks/s  ETA {eta/60:.1f}m",
                  flush=True)
    if rows:
        client.insert(COLLECTION, rows)
    client.flush(COLLECTION)
    stats = client.get_collection_stats(COLLECTION)
    print(f"DONE: {stats['row_count']} rows in {COLLECTION} "
          f"({(time.time()-t0)/60:.1f}m embed+insert)", flush=True)


if __name__ == "__main__":
    main()
