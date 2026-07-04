#!/usr/bin/env python3
"""Convierte documentacion-sistema.md a PDF con fpdf2."""

import re
import sys
from pathlib import Path

from fpdf import FPDF


class DocPDF(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(120, 120, 120)
            self.cell(0, 8, "Posta / LupoEnvios - Documentacion del Sistema", align="C")
            self.ln(10)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Pagina {self.page_no()}/{{nb}}", align="C")


def sanitize(text: str) -> str:
    replacements = {
        "\u2014": "-",
        "\u2013": "-",
        "\u2192": "->",
        "\u2190": "<-",
        "\u2194": "<->",
        "\u2193": "v",
        "\u2191": "^",
        "\u2198": "->",
        "\u2022": "-",
        "\u00b7": "-",
        "\u201c": '"',
        "\u201d": '"',
        "\u2018": "'",
        "\u2019": "'",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text.encode("latin-1", errors="replace").decode("latin-1")


def write_wrapped(pdf: DocPDF, text: str, size: int = 10, style: str = "", indent: int = 0):
    pdf.set_font("Helvetica", style, size)
    pdf.set_text_color(30, 30, 30)
    x = pdf.l_margin + indent
    pdf.set_x(x)
    w = pdf.w - pdf.l_margin - pdf.r_margin - indent
    pdf.multi_cell(w, 5.5, sanitize(text))


def render_md(pdf: DocPDF, md_path: Path):
    lines = md_path.read_text(encoding="utf-8").splitlines()
    in_code = False
    code_lines: list[str] = []
    i = 0

    while i < len(lines):
        line = lines[i]

        if line.strip().startswith("```"):
            if in_code:
                pdf.set_fill_color(245, 245, 245)
                pdf.set_font("Courier", "", 8)
                pdf.set_text_color(40, 40, 40)
                block = "\n".join(code_lines)
                w = pdf.w - pdf.l_margin - pdf.r_margin
                pdf.multi_cell(w, 4.5, sanitize(block), fill=True)
                pdf.ln(3)
                code_lines = []
                in_code = False
            else:
                in_code = True
            i += 1
            continue

        if in_code:
            code_lines.append(line)
            i += 1
            continue

        if line.strip() == "---":
            pdf.ln(2)
            y = pdf.get_y()
            pdf.set_draw_color(200, 200, 200)
            pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
            pdf.ln(5)
            i += 1
            continue

        if line.startswith("# "):
            pdf.ln(4)
            pdf.set_font("Helvetica", "B", 18)
            pdf.set_text_color(20, 60, 120)
            write_wrapped(pdf, line[2:].strip(), size=18, style="B")
            pdf.ln(3)
            i += 1
            continue

        if line.startswith("## "):
            pdf.ln(3)
            pdf.set_font("Helvetica", "B", 14)
            pdf.set_text_color(30, 80, 140)
            write_wrapped(pdf, line[3:].strip(), size=14, style="B")
            pdf.ln(2)
            i += 1
            continue

        if line.startswith("### "):
            pdf.ln(2)
            write_wrapped(pdf, line[4:].strip(), size=11, style="B")
            pdf.ln(1)
            i += 1
            continue

        if line.strip().startswith("|") and "|" in line[1:]:
            table_rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                row = lines[i].strip()
                if not re.match(r"^\|[-:\s|]+\|$", row):
                    cells = [c.strip() for c in row.strip("|").split("|")]
                    table_rows.append(cells)
                i += 1
            if table_rows:
                pdf.set_font("Helvetica", "", 9)
                col_count = max(len(r) for r in table_rows)
                w = pdf.w - pdf.l_margin - pdf.r_margin
                col_w = w / col_count
                for ri, row in enumerate(table_rows):
                    style = "B" if ri == 0 else ""
                    pdf.set_font("Helvetica", style, 9)
                    pdf.set_fill_color(230, 240, 250) if ri == 0 else pdf.set_fill_color(255, 255, 255)
                    for ci in range(col_count):
                        cell = row[ci] if ci < len(row) else ""
                        cell = re.sub(r"\*\*(.+?)\*\*", r"\1", cell)
                        pdf.cell(col_w, 6, sanitize(cell[:40]), border=1, fill=(ri == 0))
                    pdf.ln()
                pdf.ln(3)
            continue

        if line.strip().startswith("- ") or line.strip().startswith("* "):
            text = re.sub(r"\*\*(.+?)\*\*", r"\1", line.strip()[2:])
            write_wrapped(pdf, f"  - {text}", size=10, indent=4)
            i += 1
            continue

        if re.match(r"^\d+\.\s", line.strip()):
            write_wrapped(pdf, f"  {line.strip()}", size=10, indent=4)
            i += 1
            continue

        if line.strip().startswith("**") and line.strip().endswith("**"):
            write_wrapped(pdf, line.strip().strip("*"), size=10, style="B")
            pdf.ln(1)
            i += 1
            continue

        stripped = line.strip()
        if stripped:
            text = re.sub(r"\*\*(.+?)\*\*", r"\1", stripped)
            text = re.sub(r"`(.+?)`", r"\1", text)
            write_wrapped(pdf, text, size=10)
            pdf.ln(1)
        else:
            pdf.ln(2)

        i += 1


def main():
    root = Path(__file__).resolve().parent.parent
    md_path = root / "docs" / "documentacion-sistema.md"
    pdf_path = root / "docs" / "documentacion-sistema.pdf"

    if not md_path.exists():
        print(f"No se encontro: {md_path}", file=sys.stderr)
        sys.exit(1)

    pdf = DocPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.set_margins(18, 18, 18)
    pdf.add_page()
    render_md(pdf, md_path)
    pdf.output(str(pdf_path))
    print(f"PDF generado: {pdf_path}")


if __name__ == "__main__":
    main()
