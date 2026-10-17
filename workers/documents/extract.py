"""Untrusted files -> bounded JSON, never executable SQL or HTML.

Run in a worker process with a timeout and resource limits imposed by its caller.
Original bytes are kept by the caller. No network access is performed here.
"""
import io
import json
import os
import hashlib
import posixpath
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

from bs4 import BeautifulSoup
from defusedxml import ElementTree as ET
from pypdf import PdfReader
from pypdf import __version__ as pdf_version

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

MAX_TEXT = 8_000_000
MAX_ARCHIVE = 64_000_000
MAX_ENTRIES = 500
XSD = '{http://www.w3.org/2001/XMLSchema}'


def ocr_page(data, number):
    """Render only the requested page; OCR is optional until tools are installed."""
    tesseract = shutil.which('tesseract')
    if not tesseract and Path('C:/Program Files/Tesseract-OCR/tesseract.exe').is_file():
        tesseract = 'C:/Program Files/Tesseract-OCR/tesseract.exe'
    if not tesseract:
        raise RuntimeError('OCR indisponível: instalar Tesseract com idioma por')
    with tempfile.TemporaryDirectory(prefix='erp-document-ocr-') as temporary:
        source = Path(temporary) / 'source.pdf'
        image = Path(temporary) / 'page'
        source.write_bytes(data)
        if shutil.which('pdftoppm'):
            subprocess.run(['pdftoppm', '-f', str(number), '-l', str(number), '-singlefile', '-scale-to', '2200', '-png', str(source), str(image)], check=True, capture_output=True, timeout=45)
        else:
            import pypdfium2
            with pypdfium2.PdfDocument(data) as pdf:
                page = pdf[number-1]
                scale = 2200 / max(page.get_size())
                bitmap = page.render(scale=scale)
                bitmap.to_pil().save(str(image)+'.png')
                bitmap.close()
                page.close()
        command = [tesseract, str(image) + '.png', 'stdout', '-l', 'por']
        if os.environ.get('ERP_DOCUMENTS_TESSDATA'):
            command.extend(['--tessdata-dir', os.environ['ERP_DOCUMENTS_TESSDATA']])
        output = subprocess.run(command + ['tsv'], check=True, capture_output=True, text=True, encoding='utf-8', timeout=45)
        import csv
        rows = list(csv.DictReader(io.StringIO(output.stdout), delimiter='\t'))
        words = [row for row in rows if row.get('text', '').strip() and float(row.get('conf') or -1) >= 0]
        confidence = sum(float(row['conf']) for row in words) / len(words) if words else 0
        text = ' '.join(row['text'] for row in words)
        version = subprocess.run([tesseract, '--version'], capture_output=True, text=True, timeout=5).stdout.splitlines()[0]
        return text, confidence, version


def decode(data):
    if data.startswith((b'\xff\xfe', b'\xfe\xff')):
        return data.decode('utf-16')
    for encoding in ('utf-8-sig', 'cp1252'):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            pass
    return data.decode('utf-8', errors='replace')


def extract(data, name, mime='', depth=0, budget=None):
    if budget is None:
        budget = {'entries': 0, 'expanded': 0}
    result = {'title': name, 'pages': [], 'links': [], 'elements': [], 'warnings': [],
              'metadata': {}, 'extractor': 'documents-v2'}
    suffix = Path(name.split('?')[0].strip()).suffix.lower()
    if data.startswith(b'PK\x03\x04'):
        with zipfile.ZipFile(io.BytesIO(data)) as package:
            if 'xl/workbook.xml' in package.namelist():
                suffix = '.xlsx'
    if data.startswith(b'%PDF-'):
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted:
            raise ValueError('PDF criptografado: requer tratamento manual')
        if len(reader.pages) > 1500:
            raise ValueError('PDF excede 1500 páginas')
        result['extractor'] += '-pypdf-' + pdf_version
        result['title'] = str((reader.metadata or {}).get('/Title') or name)
        result['metadata']['ocr'] = []
        for index, page in enumerate(reader.pages, 1):
            content = page.extract_text(extraction_mode='layout') or ''
            if len(content.strip()) < 30:
                try:
                    content, confidence, engine = ocr_page(data, index)
                    result['metadata']['ocr'].append({'page': index, 'engine': engine, 'confidence': round(confidence, 2), 'method': 'tesseract-por-tsv'})
                    if confidence < 85 or not content.strip():
                        result['warnings'].append(f'Página {index}: OCR com confiança {confidence:.1f}; revisar')
                except Exception as error:
                    result['warnings'].append(f'Página {index}: OCR pendente: {str(error)[:180]}; original preservado')
            result['pages'].append({'page': index, 'section': '', 'content': content})
        result['metadata']['table_policy'] = 'Layout textual preservado; tabelas exigem revisão antes de estruturar dados.'
    elif suffix == '.doc' and data.startswith(bytes.fromhex('d0cf11e0a1b11ae1')):
        if not shutil.which('antiword'):
            result['warnings'].append('DOC legado requer antiword; original preservado')
        else:
            with tempfile.TemporaryDirectory(prefix='erp-doc-') as temporary:
                source = Path(temporary) / 'source.doc'
                source.write_bytes(data)
                output = subprocess.run(['antiword', '-m', 'UTF-8.txt', str(source)], check=True, capture_output=True, timeout=40)
                result['pages'] = [{'page': 1, 'section': 'Texto DOC legado; paginação não fornecida pelo formato', 'content': output.stdout.decode('utf-8', errors='replace')}]
    elif suffix == '.docx' and data.startswith(b'PK\x03\x04'):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if sum(f.file_size for f in archive.infolist()) > MAX_ARCHIVE:
                raise ValueError('DOCX excede limite de expansão')
            root = ET.fromstring(archive.read('word/document.xml'))
            ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
            result['pages'] = [{'page': 1, 'section': 'DOCX; paginação visual requer revisão', 'content': '\n'.join(''.join(p.itertext()) for p in root.iter(ns+'p'))}]
    elif data.startswith(b'PK\x03\x04') and suffix not in ('.xlsx', '.xlsm'):
        if depth >= 3:
            raise ValueError('ZIP excede três níveis de arquivos aninhados')
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            files = archive.infolist()
            names = {f.filename.replace('\\', '/') for f in files}
            result['metadata']['archive_entries'] = []
            result['metadata']['schema_dependencies'] = []
            budget['entries'] += len(files)
            budget['expanded'] += sum(f.file_size for f in files)
            if budget['entries'] > MAX_ENTRIES or budget['expanded'] > MAX_ARCHIVE:
                raise ValueError('ZIP excede limites de entradas ou expansão')
            for entry in files:
                path = PurePosixPath(entry.filename.replace('\\', '/'))
                if path.is_absolute() or '..' in path.parts or ':' in entry.filename or (entry.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError('ZIP com caminho inseguro')
                if entry.is_dir():
                    continue
                if entry.flag_bits & 1 or entry.file_size > 16_000_000 or entry.file_size > max(entry.compress_size, 1) * 300:
                    raise ValueError('ZIP criptografado ou expansão excessiva')
                try:
                    child_bytes = archive.read(entry)
                    child = extract(child_bytes, entry.filename, depth=depth+1, budget=budget)
                    result['pages'].extend({**p, 'section': entry.filename + (' / ' + p['section'] if p['section'] else '')} for p in child['pages'])
                    result['elements'].extend({**e, 'archive_path': entry.filename + ('/' + e['archive_path'] if e.get('archive_path') else '')} for e in child['elements'])
                    for link in child['links']:
                        if re.match(r'^https?://', link):
                            result['links'].append(link)
                        else:
                            relative = posixpath.normpath(posixpath.join(posixpath.dirname(entry.filename), link))
                            result['metadata']['schema_dependencies'].append({'entry': entry.filename, 'reference': link, 'resolved_path': relative, 'in_archive': relative in names})
                    result['metadata']['archive_entries'].append({'name': entry.filename, 'sha256': hashlib.sha256(child_bytes).hexdigest(), 'extractor': child['extractor'], 'metadata': child['metadata']})
                    result['warnings'].extend(f'{entry.filename}: {w}' for w in child['warnings'])
                except Exception as error:
                    result['warnings'].append(f'{entry.filename}: {type(error).__name__}: {str(error)[:200]}')
    elif suffix == '.xls':
        import xlrd
        book = xlrd.open_workbook(file_contents=data, on_demand=True)
        try:
            for index, sheet in enumerate(book.sheets(), 1):
                if sheet.nrows > 100_000 or sheet.ncols > 200 or sheet.nrows * sheet.ncols > 2_000_000:
                    raise ValueError('Planilha XLS excede limite de células')
                lines = ['\t'.join(str(value) for value in sheet.row_values(row)) for row in range(sheet.nrows)]
                result['pages'].append({'page': index, 'section': sheet.name, 'content': '\n'.join(lines)})
        finally:
            book.release_resources()
    elif suffix in ('.xlsx', '.xlsm'):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if sum(f.file_size for f in archive.infolist()) > MAX_ARCHIVE:
                raise ValueError('Planilha excede limite de expansão')
            ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            strings = []
            if 'xl/sharedStrings.xml' in archive.namelist():
                strings = [''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', ns)]
            workbook = ET.fromstring(archive.read('xl/workbook.xml'))
            sheets = workbook.findall('s:sheets/s:sheet', ns)
            relations = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
            targets = {r.attrib['Id']: r.attrib['Target'] for r in relations}
            for index, sheet in enumerate(sheets, 1):
                rid = sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
                target = targets[rid]
                path = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
                if not path.startswith('xl/') or '..' in PurePosixPath(path).parts:
                    raise ValueError('Referência de planilha fora do pacote')
                root = ET.fromstring(archive.read(path))
                lines = []
                cells = 0
                for row_number, row in enumerate(root.findall('s:sheetData/s:row', ns), 1):
                    values = {}
                    for cell in row.findall('s:c', ns):
                        value = cell.findtext('s:v', default='', namespaces=ns)
                        kind = cell.attrib.get('t')
                        if kind == 's' and value:
                            value = strings[int(value)]
                        elif kind == 'inlineStr':
                            value = ''.join(cell.find('s:is', ns).itertext())
                        if not value:
                            continue
                        column = 0
                        for letter in re.match(r'[A-Z]+', cell.attrib['r']).group():
                            column = column * 26 + ord(letter) - 64
                        if column > 200:
                            raise ValueError('Planilha excede 200 colunas com dados')
                        values[column] = value
                    cells += len(values)
                    if row_number > 100_000 or cells > 2_000_000:
                        raise ValueError('Planilha excede limite de células efetivas')
                    if values:
                        lines.append('\t'.join(values.get(column, '') for column in range(1, max(values) + 1)))
                result['pages'].append({'page': index, 'section': sheet.attrib.get('name', str(index)), 'content': '\n'.join(lines)})
            result['metadata']['spreadsheet_mode'] = 'cached-values-no-styles-or-macros'
    elif suffix in ('.xml', '.xsd', '.wsdl') or 'xml' in mime:
        try:
            root = ET.fromstring(data)
        except Exception as error:
            from xml.etree.ElementTree import ParseError
            if not isinstance(error, (ParseError, UnicodeDecodeError)):
                raise
            root = ET.fromstring(decode(data))
            result['warnings'].append('XML: codificação declarada diverge dos bytes; texto normalizado, original preservado')
        text = decode(data)
        result['pages'] = [{'page': 1, 'section': 'XML original', 'content': text}]
        namespace = root.attrib.get('targetNamespace', '')
        for el in root.iter():
            kind = el.tag.split('}')[-1]
            if kind not in ('element', 'attribute', 'complexType', 'simpleType', 'include', 'import', 'operation', 'message'):
                continue
            result['elements'].append({'namespace': namespace, 'name': el.attrib.get('name') or el.attrib.get('schemaLocation') or el.attrib.get('ref', ''),
                'kind': kind, 'type_name': el.attrib.get('type'), 'min_occurs': el.attrib.get('minOccurs'), 'max_occurs': el.attrib.get('maxOccurs'),
                'documentation': ' '.join(''.join(e.itertext()) for e in el.iter(XSD + 'documentation')),
                'details': {'attributes': el.attrib, 'enumerations': [e.attrib.get('value') for e in el.iter(XSD + 'enumeration')]}})
            if el.attrib.get('schemaLocation'):
                result['links'].append(el.attrib['schemaLocation'])
    elif 'html' in mime or re.search(br'<(?:!doctype\s+html|html)[\s>]', data[:2000], re.I):
        soup = BeautifulSoup(decode(data), 'html.parser')
        result['title'] = soup.title.get_text(' ', strip=True) if soup.title else name
        main = soup.find(id='conteudoDinamico') or soup.find('main') or soup.find('article') or soup.body or soup
        result['links'] = [a.get('href') for a in main.find_all('a', href=True)]
        breadcrumb = soup.find(id='caminho')
        if breadcrumb:
            result['title'] = breadcrumb.get_text(' ', strip=True)
        result['metadata']['encoding'] = 'utf-8' if data.decode('utf-8', errors='ignore').encode('utf-8') == data else 'cp1252'
        for tag in soup(['script', 'style', 'nav', 'header', 'footer', 'noscript']):
            tag.decompose()
        result['pages'] = [{'page': 1, 'section': '', 'content': main.get_text('\n', strip=True)}]
    elif suffix in ('.p7b', '.p7c', '.cer', '.crt'):
        openssl = shutil.which('openssl')
        if not openssl:
            result['warnings'].append('OpenSSL indisponível para leitura de certificado público')
        else:
            command = ['pkcs7', '-print_certs'] if suffix in ('.p7b', '.p7c') else ['x509']
            output = subprocess.run([openssl, *command, '-inform', 'DER', '-text', '-noout'], input=data, capture_output=True, timeout=20, check=True)
            result['pages'] = [{'page': 1, 'section': 'Metadados do certificado público', 'content': output.stdout.decode('utf-8', errors='replace')}]
            result['metadata']['certificate_trust_validated'] = False
    elif suffix in ('.sql', '.txt', '.md', '.csv', '.json') or mime.startswith('text/'):
        text = decode(data)
        result['pages'] = [{'page': 1, 'section': '', 'content': text}]
        if suffix == '.sql':
            import sqlparse
            result['metadata']['sql_statement_types'] = [s.get_type() for s in sqlparse.parse(text)][:1000]
            result['metadata']['sql_executed'] = False
            result['warnings'].append('SQL somente documental; execução proibida')
    else:
        result['warnings'].append('Formato não suportado para extração; original disponível')
    if sum(len(p['content']) for p in result['pages']) > MAX_TEXT:
        raise ValueError('Texto extraído excede limite')
    if not any(p['content'].strip() for p in result['pages']):
        result['warnings'].append('Nenhum texto extraído')
    return result


if __name__ == '__main__':
    try:
        data = Path(sys.argv[1]).read_bytes()
        if len(data) > 32_000_000:
            raise ValueError('Arquivo excede limite de 32 MB')
        print(json.dumps(extract(data, sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else ''), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'error': f'{type(error).__name__}: {str(error)[:300]}'}))
        sys.exit(1)
