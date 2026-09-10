"""Read immutable originals into a private, page-indexed search derivative."""
import argparse
import hashlib
import io
import json
import logging
import os
from pathlib import Path
import tempfile

from pypdf import PdfReader


def extract(mapping_path, output_path):
    work = (Path.home() / ".HaloHub").resolve(strict=True)
    output = Path(output_path)
    if output.suffix != ".json" or output.is_symlink():
        raise ValueError("INVALID_INDEX_PATH")
    parent = output.parent.resolve(strict=True)
    if not parent.is_relative_to(work) or output.resolve() == Path(mapping_path).resolve():
        raise ValueError("INDEX_OUTSIDE_PRIVATE_WORKSPACE")
    mapping = json.loads(Path(mapping_path).read_text())
    root = Path(mapping["originalRoot"]).resolve(strict=True)
    corrected = Path(mapping["correctedRoot"]).resolve(strict=True)
    if parent.is_relative_to(root) or parent.is_relative_to(corrected):
        raise ValueError("INDEX_INSIDE_PDF_SOURCE")
    pairs = mapping["pairs"]
    if len(pairs) != 15 or len({p["originalHash"] for p in pairs}) != 15:
        raise ValueError("EXACT_15_MAPPING_REQUIRED")
    documents = []
    for pair in pairs:
        relative = Path(pair["originalPath"])
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("INVALID_ORIGINAL_PATH")
        source = root
        for part in relative.parts:
            source = source / part
            if source.is_symlink():
                raise ValueError("SOURCE_SYMLINK")
        data = source.read_bytes()
        if hashlib.sha256(data).hexdigest() != pair["originalHash"] or len(data) != pair["originalBytes"]:
            raise ValueError("ORIGINAL_BYTES_CHANGED")
        reader = PdfReader(io.BytesIO(data))
        pages = [{"page": number, "text": page.extract_text() or ""}
                 for number, page in enumerate(reader.pages, 1)]
        if source.read_bytes() != data:
            raise ValueError("ORIGINAL_BYTES_CHANGED_DURING_EXTRACTION")
        documents.append({"sourceKey": pair["sourceKey"], "originalSha256": pair["originalHash"],
                          "fileUrl": pair["newFileUrl"], "pages": pages,
                          "emptyPages": [p["page"] for p in pages if not p["text"].strip()]})
    payload = {"version": 1, "kind": "original-pdf-page-text", "pdfMutation": False,
               "privateDerivativeOnly": True, "documents": documents}
    fd, temporary = tempfile.mkstemp(prefix="original-index-", suffix=".tmp", dir=parent)
    try:
        with os.fdopen(fd, "w", encoding="utf8") as handle:
            json.dump(payload, handle, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, output)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(json.dumps({"documents": len(documents), "pages": sum(len(d["pages"]) for d in documents),
                      "emptyPages": sum(len(d["emptyPages"]) for d in documents), "pdfsModified": 0}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--map", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    logging.getLogger("pypdf").disabled = True
    try:
        extract(args.map, args.output)
    except Exception:
        raise SystemExit("ORIGINAL_TEXT_EXTRACTION_FAILED") from None
