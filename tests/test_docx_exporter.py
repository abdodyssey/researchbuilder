import os
from pathlib import Path
import docx
from utils.docx_exporter import export_to_docx

def test_export_docx():
    template_path = "templates/sinta2kolom_v2.docx"
    output_path = "scratch/test_output.docx"

    # 1. Render dokumen pakai data dummy
    article_data = {
        "judul_artikel": "Judul Uji Coba",
        "nama_penulis": "John Doe",
        "afiliasi": "Universitas Terbuka",
        "email_korespondensi": "john@example.com",
        "abstrak": "Paragraf pertama abstrak.\n\nParagraf kedua abstrak.",
        "kata_kunci": "AI, Docx, Template",
        "daftar_bab": [
            {
                "judul_bab": "1. PENDAHULUAN",
                "isi_bab": "Ini adalah paragraf pertama pendahuluan.\n\nIni paragraf kedua pendahuluan."
            },
            {
                "judul_bab": "2. METODE",
                "isi_bab": "Isi metode satu paragraf saja."
            }
        ],
        "daftar_referensi": [
            {"teks_sitasi": "[ref_001] Penulis A (2020). Buku A. URL"},
            {"teks_sitasi": "[ref_002] Penulis B (2021). Buku B. URL"},
            {"teks_sitasi": "[ref_003] Penulis C (2022). Buku C. URL"}
        ]
    }

    os.makedirs("scratch", exist_ok=True)
    export_to_docx(article_data, template_path, output_path)

    assert os.path.exists(output_path), "Output file should exist"

    # 2. Buka hasilnya pakai python-docx
    doc = docx.Document(output_path)
    full_text_str = doc._element.body.xml

    # Assert tidak ada tag {{ atau }} tersisa
    assert "{{" not in full_text_str, "Tag {{ still remains in the document!"
    assert "}}" not in full_text_str, "Tag }} still remains in the document!"

    # Abstrak has 2 paragraphs, so we should see both paragraphs
    assert "Paragraf pertama abstrak." in full_text_str
    assert "Paragraf kedua abstrak." in full_text_str

    # Font run pertama di body text (Pendahuluan)
    # Let's find "Ini adalah paragraf pertama pendahuluan."
    assert "Ini adalah paragraf pertama pendahuluan." in full_text_str, "Pendahuluan text not found in rendered document"

    print("All tests passed successfully!")

if __name__ == "__main__":
    test_export_docx()
