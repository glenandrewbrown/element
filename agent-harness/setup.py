"""Setup for cli-anything-element — an agent CLI bridge to drive/inspect Element.

PEP 420 namespace package: ``cli_anything/`` has NO __init__.py, so this package
coexists with other cli-anything-* harnesses under the shared ``cli_anything``
namespace. The ``element`` sub-package does have an __init__.py.
"""

from setuptools import setup, find_namespace_packages

setup(
    name="cli-anything-element",
    version="0.1.0",
    author="cli-anything contributors",
    author_email="",
    description="CLI-Anything harness to drive & inspect the Element audio host for QA/debug",
    url="https://github.com/HKUDS/CLI-Anything",
    packages=find_namespace_packages(include=["cli_anything.*"]),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Multimedia :: Sound/Audio",
        "Topic :: Software Development :: Testing",
        "License :: OSI Approved :: GNU General Public License v3 (GPLv3)",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    python_requires=">=3.10",
    install_requires=[
        "click>=8.0.0",
    ],
    extras_require={
        "repl": ["prompt-toolkit>=3.0.0"],
        "dev": ["pytest>=7.0.0", "prompt-toolkit>=3.0.0"],
    },
    entry_points={
        "console_scripts": [
            "cli-anything-element=cli_anything.element.element_cli:main",
        ],
    },
    package_data={
        "cli_anything.element": ["skills/*.md"],
    },
    include_package_data=True,
    zip_safe=False,
)
