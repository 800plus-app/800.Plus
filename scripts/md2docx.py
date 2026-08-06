# -*- coding: utf-8 -*-
"""Markdown -> DOCX, בלי תלויות חיצוניות.

למה נכתב ולא הותקן ממיר: על המכונה אין pandoc ואין python-docx, והפרויקט הוא
וונילה בלי שלב build. DOCX הוא ZIP עם קובצי XML, ולכן אפשר לייצר אותו עם
zipfile של הספרייה הסטנדרטית בלבד.

מה שקריטי במסמך עברי: <w:bidi/> ברמת הפסקה ו-<w:rtl/> ברמת הריצה. בלי שניהם
Word מציג את הטקסט ב-LTR, סימני פיסוק קופצים לצד הלא נכון, ורשימות ממוספרות
מיושרות שמאלה. נבדק בפועל.
"""
import io, re, sys, zipfile

def esc(t):
    return (t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))

def runs(text):
    """**מודגש** ו-`קוד` -> ריצות. כל ריצה נושאת <w:rtl/>."""
    text = re.sub(r'<span dir="ltr">(.*?)</span>', r'\1', text)   # ה-HTML של הטיוטה
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)          # קישורים -> טקסט
    out = []
    for part in re.split(r'(\*\*[^*]+\*\*|`[^`]+`)', text):
        if not part:
            continue
        bold = part.startswith('**')
        code = part.startswith('`')
        body = part[2:-2] if bold else (part[1:-1] if code else part)
        if not body:
            continue
        props = '<w:rtl/>'
        if bold:
            props = '<w:b/><w:bCs/>' + props
        if code:
            props = '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' + props
        out.append('<w:r><w:rPr>%s</w:rPr><w:t xml:space="preserve">%s</w:t></w:r>' % (props, esc(body)))
    return ''.join(out) or '<w:r><w:rPr><w:rtl/></w:rPr><w:t/></w:r>'

def para(text, style=None, bullet=False):
    pr = '<w:bidi/>'
    if style:
        pr = '<w:pStyle w:val="%s"/>' % style + pr
    if bullet:
        pr += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
    pr += '<w:spacing w:after="140" w:line="288" w:lineRule="auto"/><w:jc w:val="both"/>'
    return '<w:p><w:pPr>%s</w:pPr>%s</w:p>' % (pr, runs(text))

def cells(line):
    return [c.strip() for c in line.strip().strip('|').split('|')]

def is_sep(line):
    return bool(re.match(r'^\s*\|[\s:\-|]+\|\s*$', line))

def table(rows):
    """טבלת markdown -> <w:tbl>. הכיוון הפוך: <w:bidiVisual/> הופך את סדר העמודות,
       ובלעדיו העמודה הראשונה בקובץ מופיעה משמאל במסמך עברי."""
    head, body = rows[0], rows[1:]
    def tc(text, bold):
        shade = '<w:shd w:val="clear" w:fill="FAF6EE"/>' if bold else ''
        r = runs(('**%s**' % text) if bold and not text.startswith('**') else text)
        return ('<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>%s</w:tcPr>'
                '<w:p><w:pPr><w:bidi/><w:spacing w:after="40"/></w:pPr>%s</w:p></w:tc>' % (shade, r))
    out = ['<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:bidiVisual/>'
           '<w:tblW w:w="5000" w:type="pct"/><w:tblBorders>'
           + ''.join('<w:%s w:val="single" w:sz="4" w:space="0" w:color="C9C0AE"/>' % s
                     for s in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'))
           + '</w:tblBorders></w:tblPr>']
    out.append('<w:tr><w:trPr><w:tblHeader/></w:trPr>' + ''.join(tc(c, True) for c in head) + '</w:tr>')
    for r in body:
        out.append('<w:tr>' + ''.join(tc(c, False) for c in r) + '</w:tr>')
    out.append('</w:tbl><w:p><w:pPr><w:bidi/><w:spacing w:after="120"/></w:pPr></w:p>')
    return ''.join(out)

def convert(md):
    body = []
    lines = md.split('\n')
    # שורה ריקה בין שתי שורות טבלה מפצלת אותה לשתיים, והשנייה (שאין לפניה מפריד)
    # הייתה נופלת לפסקה רגילה עם קווים אנכיים בטקסט. נמדד במדיניות הפרטיות.
    lines = [l for k, l in enumerate(lines)
             if l.strip() or not (0 < k < len(lines) - 1
                                  and lines[k - 1].strip().startswith('|')
                                  and lines[k + 1].strip().startswith('|'))]
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        # טבלה: שורה שמתחילה בקו אנכי ואחריה שורת מפריד
        if line.strip().startswith('|') and i + 1 < len(lines) and is_sep(lines[i + 1]):
            rows = [cells(line)]
            i += 2
            while i < len(lines) and lines[i].strip().startswith('|'):
                rows.append(cells(lines[i])); i += 1
            body.append(table(rows))
            continue
        i += 1
        if not line.strip():
            continue
        if line.strip() in ('---', '***', '___'):
            body.append('<w:p><w:pPr><w:bidi/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="C9C0AE"/></w:pBdr></w:pPr></w:p>')
            continue
        m = re.match(r'^(#{1,4})\s+(.*)$', line)
        if m:
            body.append(para(m.group(2), style='Heading%d' % min(len(m.group(1)), 3)))
            continue
        m = re.match(r'^[-*]\s+(.*)$', line)
        if m:
            body.append(para(m.group(1), bullet=True))
            continue
        m = re.match(r'^(\d+)\.\s+(.*)$', line)
        if m:
            body.append(para(m.group(1) + '. ' + m.group(2)))
            continue
        body.append(para(line))
    return ''.join(body)

DOC = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
 '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
 '<w:body>%s<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
 '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>'
 '<w:bidi/></w:sectPr></w:body></w:document>')

CT = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
 '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
 '<Default Extension="xml" ContentType="application/xml"/>'
 '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
 '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
 '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
 '</Types>')

RELS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
 '</Relationships>')

DRELS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
 '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
 '</Relationships>')

def heading(i, size, color):
    return ('<w:style w:type="paragraph" w:styleId="Heading%d"><w:name w:val="heading %d"/>'
            '<w:pPr><w:bidi/><w:keepNext/><w:spacing w:before="280" w:after="120"/></w:pPr>'
            '<w:rPr><w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/><w:b/><w:bCs/>'
            '<w:color w:val="%s"/><w:sz w:val="%d"/><w:szCs w:val="%d"/><w:rtl/></w:rPr></w:style>'
            % (i, i, color, size, size))

STYLES = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
 '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
 '<w:docDefaults><w:rPrDefault><w:rPr>'
 '<w:rFonts w:ascii="David" w:hAnsi="David" w:cs="David"/>'
 '<w:sz w:val="22"/><w:szCs w:val="22"/><w:rtl/></w:rPr></w:rPrDefault>'
 '<w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault></w:docDefaults>'
 + heading(1, 36, '8F3620') + heading(2, 28, '2C2620') + heading(3, 24, '2C2620') +
 '</w:styles>')

NUM = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
 '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
 '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/>'
 '<w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="right"/>'
 '<w:pPr><w:ind w:right="425" w:hanging="284"/></w:pPr></w:lvl></w:abstractNum>'
 '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>')

def build(md_path, out_path):
    md = io.open(md_path, encoding='utf-8').read()
    with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', CT)
        z.writestr('_rels/.rels', RELS)
        z.writestr('word/_rels/document.xml.rels', DRELS)
        z.writestr('word/styles.xml', STYLES)
        z.writestr('word/numbering.xml', NUM)
        z.writestr('word/document.xml', DOC % convert(md))
    return out_path

if __name__ == '__main__':
    print(build(sys.argv[1], sys.argv[2]))
