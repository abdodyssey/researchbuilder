import docx

def inspect():
    doc = docx.Document("templates/jurnal_komputer_sinta.docx")
    for i, p in enumerate(doc.paragraphs[:20]):
        print(f"[{i}] {p.text}")

if __name__ == "__main__":
    inspect()
