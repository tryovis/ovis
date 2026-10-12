"""Exercise the extended tumorboard SQL with synthetic rows in SQLite.

Only MySQL's ordered GROUP_CONCAT syntax is adapted; MySQL scalar functions
are supplied below. This is a local projection/regression check, not a MariaDB test.
"""
from pathlib import Path
import datetime
import json
import argparse
import re
import sqlite3

HERE = Path(__file__).parent
current = (HERE / 'sql/tumorBoardWuerzburg.sql').read_text(encoding='utf-8')
fields = ['referrer', 'humanGeneticConsultation', 'pathologyReport', 'therapyProposals',
          'rationaleTherapyRecommendation', 'molecularAnalysis', 'nctMaster',
          'targetabilityAndTargeting', 'freeTextsAndRemarks', 'molecularCounseling']
db = sqlite3.connect(':memory:')
db.row_factory = sqlite3.Row
db.create_function('CONCAT', -1, lambda *xs: None if None in xs else ''.join(map(str, xs)))
db.create_function('CONCAT_WS', -1, lambda sep, *xs: sep.join(str(x) for x in xs if x is not None))
db.create_function('REGEXP', 2, lambda pattern, value: bool(re.search(pattern, value or '')))
def date(value, pattern):
    if not value:
        return None
    try:
        return datetime.datetime.strptime(value, pattern.replace('%i', '%M')).strftime('%Y-%m-%d')
    except ValueError:
        return None
db.create_function('STR_TO_DATE', 2, date)
tables = {'p': 'patient', 'e': 'erkrankung', 'ep': 'erkrankung_prozedur', 'pz': 'prozedur',
          'tk': 'dk_tumorkonferenz', 'merkmal': 'dk_tumorkonferenz_merkmale',
          'b': 'dk_ukw_tb_basisdaten', 'm': 'dk_ukw_tb_mol'}
for alias, table in tables.items():
    columns = sorted(set(re.findall(r'\b' + alias + r'\.(\w+)', current)))
    db.execute(f'CREATE TABLE {table} ({", ".join(chr(34)+c+chr(34)+(" INTEGER" if c == "geloescht" else " TEXT") for c in columns)})')
db.execute('CREATE TABLE property_catalogue_version_entry (code TEXT, property_version_id TEXT, shortdesc TEXT)')
def insert(table, **row):
    db.execute(f'INSERT INTO {table} ({", ".join(row)}) VALUES ({", ".join("?" for _ in row)})', list(row.values()))
def catalogue(code, version, label):
    insert('property_catalogue_version_entry', code=code, property_version_id=version, shortdesc=label)

for number in range(1, 7):
    insert('patient', mpi_id=str(number), personenstamm='4')
    insert('erkrankung', id=f'T-DEMO-{number:03}', mpi_id=str(number))
    insert('erkrankung_prozedur', prozedur_id=str(number), erkrankung_id=f'T-DEMO-{number:03}')
    insert('prozedur', id=str(number), geloescht='0', beginndatum=f'2026-09-{10+number:02}')
insert('dk_tumorkonferenz', id='1', datum='2026-09-11', tk='STD', tk_propcat_version='tb',
       typ='V', typ_propcat_version='mode', praepost='P', praepost_propcat_version='prepost',
       internextern='I', internextern_propcat_version='internal')
insert('dk_tumorkonferenz_merkmale', eintrag_id='1', feldwert='Standardempfehlung')
catalogue('STD', 'tb', 'Interdisziplinäres Tumorboard')
catalogue('V', 'mode', 'Vor Ort')
catalogue('P', 'prepost', 'Prätherapeutisch')
catalogue('I', 'internal', 'Intern')
catalogue('20', 'tb', 'Molekulares Tumorboard')
for number in range(2, 7):
    insert('dk_ukw_tb_basisdaten', id=str(number), datum=f'{10+number:02}.09.2026',
           tutype='20', tutype_propcat_version='tb', vorstellungszt='Erstvorstellung',
           weiteresvorgehen='Befundbesprechung im Verlauf' if number == 2 else None)
catalogue('J', 'yesno', 'Ja')
catalogue('A', 'proposal', 'Studienprüfung (Demobeispiel)')
catalogue('B', 'proposal', 'Erneute Besprechung (Demobeispiel)')
catalogue('R', 'rationale', 'Molekularer Befund (Demobeispiel)')
catalogue('N', 'analysis', 'NGS-Panel (Demobeispiel)')
catalogue('E', 'meeting', 'Erstvorstellung')
insert('dk_ukw_tb_mol', id='2', zuweiser='DEMO-Z01', zuweiserfreitext='Demo-Ambulanz Würzburg',
       empfhumangenvorstellung='J', empfhumangenvorstellung_propcat_version='yesno',
       pathobefund='Synthetischer Pathologiebefund – keine Patientendaten',
       therapievorschlag1='A', therapievorschlag1_propcat_version='proposal',
       therapievorschlag2='B', therapievorschlag2_propcat_version='proposal',
       rationaletherempfehlung='R', rationaletherempfehlung_propcat_version='rationale',
       empfmolanalyse='N', empfmolanalyse_propcat_version='analysis',
       empfnctmaster='J', empfnctmaster_propcat_version='yesno',
       targetierbar='J', targetierbar_propcat_version='yesno', targetierungtext='Demoziel A',
       bemerkungtargetierung='Interdisziplinär besprechen (Demo)', mol_aufklaer='ja',
       artbesprechung='E', artbesprechung_propcat_version='meeting', mol_evidenz='Demo-Level')
# Missing catalogue entries must retain their raw source values.
insert('dk_ukw_tb_mol', id='3', zuweiserfreitext='Demo-Praxis B',
       empfhumangenvorstellung='Ausstehend', therapievorschlag1='Freitext-Vorschlag (Demo)',
       rationaletherempfehlung='Noch offen', empfmolanalyse='Angefragt', empfnctmaster='Prüfen',
       targetierbar='Unklar', mol_aufklaer='nen')
# No molecular form (row 4), blank values (row 5), and literal HTML (row 6).
insert('dk_ukw_tb_mol', id='5', zuweiser='   ', zuweiserfreitext='', pathobefund=' ', mol_aufklaer=' ')
insert('dk_ukw_tb_mol', id='6', zuweiserfreitext='Demo-Zentrum C', mol_aufklaer='nein',
       pathobefund='<b>Wörtlicher Demotext</b>', therapievorschlag2='Verlaufskontrolle (Demo)')

def execute(sql):
    sql = re.sub(r"ORDER BY merkmal\.feldwert\s+SEPARATOR ','", '', sql)
    return [dict(row) for row in db.execute(sql)]
new_rows = execute(current)
assert len(new_rows) == 6, 'Preserve independent standard and UKW events'
assert new_rows[0]['type'] == 'Interdisziplinäres Tumorboard'
assert new_rows[0]['presentationMode'] == 'Vor Ort'
assert new_rows[0]['praepost'] == 'Prätherapeutisch'
assert new_rows[0]['tbInternal'] == 'Intern'
assert new_rows[0]['recommendation'] == 'Standardempfehlung'
assert all(row['type'] == 'MTB' for row in new_rows[1:])
assert [row['tumorBoardOccurrenceDate'] for row in new_rows] == [f'2026-09-{n:02}' for n in range(11, 17)]
assert 'Molekulares Evidenzlevel: Demo-Level' in new_rows[1]['recommendation']
assert all(new_rows[0][field] is None for field in fields)
assert new_rows[1]['referrer'] == 'DEMO-Z01 | Demo-Ambulanz Würzburg'
assert new_rows[1]['therapyProposals'] == '1: Studienprüfung (Demobeispiel) | 2: Erneute Besprechung (Demobeispiel)'
assert new_rows[1]['humanGeneticConsultation'] == 'Ja'
assert new_rows[1]['molecularAnalysis'] == 'NGS-Panel (Demobeispiel)'
assert new_rows[1]['nctMaster'] == 'Ja'
assert new_rows[1]['rationaleTherapyRecommendation'] == 'Molekularer Befund (Demobeispiel)'
assert new_rows[1]['targetabilityAndTargeting'] == 'Targetierbarkeit: Ja | Targetierung: Demoziel A'
assert 'Bemerkung Targetierung: Interdisziplinär besprechen (Demo)' in new_rows[1]['freeTextsAndRemarks']
assert new_rows[1]['molecularCounseling'] == 'Ja'
assert new_rows[2]['humanGeneticConsultation'] == 'Ausstehend'
assert new_rows[2]['molecularCounseling'] == 'Nein'
assert all(new_rows[3][field] is None for field in fields)
assert all(new_rows[4][field] is None for field in fields)
assert new_rows[5]['pathologyReport'] == '<b>Wörtlicher Demotext</b>'
assert new_rows[5]['molecularCounseling'] == 'Nein'
# With the feature disabled, installations without any UKW tables must work.
db.execute('DROP TABLE dk_ukw_tb_mol')
db.execute('DROP TABLE dk_ukw_tb_basisdaten')
standard_rows = execute((HERE / 'sql/tumorBoard.sql').read_text(encoding='utf-8'))
assert standard_rows == [{
    'tumorID': 'T-DEMO-001', 'tumorBoardOccurrenceDate': '2026-09-11',
    'type': 'STD', 'presentationMode': 'Vor Ort', 'praepost': 'Prätherapeutisch',
    'tbInternal': 'Intern', 'recommendation': 'Standardempfehlung'
}], 'Standard SQL must work without UKW tables or extension fields'
for number, row in enumerate(new_rows, 1):
    row.update(_id=f'TB-DEMO-{number:03}', patID=f'P-DEMO-{number:03}', tumorBoardDaysSinceDiagnosis=number * 7)
    row['tumorBoardOccurrenceDate'] = int(datetime.datetime.strptime(row['tumorBoardOccurrenceDate'], '%Y-%m-%d').replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, help='Optionally save synthetic frontend preview rows')
args = parser.parse_args()
if args.output:
    args.output.write_text(json.dumps(new_rows, ensure_ascii=False, indent=2), encoding='utf-8')
print('PASS: six standard/UKW events and ten extra fields verified; standard SQL also works without UKW tables.')
