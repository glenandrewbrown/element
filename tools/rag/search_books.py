#!/usr/bin/env python3
"""Hybrid (dense + BM25) search over the `books_cpp_audio` Milvus collection.

Usage: search_books.py "query text" [-k 5] [--book substring]
Output: ranked chunks with book / page / heading provenance.
"""

import argparse
import json
import urllib.request

from pymilvus import AnnSearchRequest, MilvusClient, RRFRanker

MILVUS = "http://localhost:19530"
OLLAMA = "http://127.0.0.1:11434"
EMBED_MODEL = "nomic-embed-text"
COLLECTION = "books_cpp_audio"


def embed_one(text):
    req = urllib.request.Request(
        f"{OLLAMA}/api/embed",
        data=json.dumps({"model": EMBED_MODEL, "input": [text],
                         "truncate": True}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())["embeddings"][0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("query")
    ap.add_argument("-k", type=int, default=5)
    ap.add_argument("--book", default=None,
                    help="filter: substring of book title")
    args = ap.parse_args()

    client = MilvusClient(MILVUS)
    expr = f'book like "%{args.book}%"' if args.book else ""

    dense_req = AnnSearchRequest(
        data=[embed_one(args.query)], anns_field="dense",
        param={"metric_type": "COSINE"}, limit=args.k * 3, expr=expr or None)
    sparse_req = AnnSearchRequest(
        data=[args.query], anns_field="sparse",
        param={"metric_type": "BM25"}, limit=args.k * 3, expr=expr or None)

    res = client.hybrid_search(
        COLLECTION, reqs=[dense_req, sparse_req], ranker=RRFRanker(60),
        limit=args.k, output_fields=["text", "book", "page", "heading"])

    for hit in res[0]:
        e = hit["entity"]
        print(f"\n=== score={hit['distance']:.4f}  {e['book']}  p.{e['page']}"
              f"  [{e['heading'] or '—'}]")
        print(e["text"][:1500])


if __name__ == "__main__":
    main()
