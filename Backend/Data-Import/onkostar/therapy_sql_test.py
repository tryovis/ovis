"""Execute the portable nuclear/other SELECTs from therapy.sql against synthetic fixtures.

Uses only Python's standard library; no Onkostar connection or patient data.
SQLite evaluates the actual SELECT expressions for these two branches. MariaDB-only
aggregations elsewhere in therapy.sql are outside this focused test's scope.
"""

from pathlib import Path
import re
import sqlite3
import unittest


SQL = (Path(__file__).parent / "sql" / "therapy.sql").read_text(encoding="utf-8")
BRANCHES = dict(
    re.findall(
        r"/\* ---------- (dk_\w+) ---------- \*/\s*"
        r"(SELECT.*?INNER JOIN Prozeduren pr ON pr\.prozedur_id = \w+\.id)",
        SQL,
        flags=re.S,
    )
)

EXTRA_FIELDS = [
    "subTypeCode",
    "subTypeDetail",
    "subTypeDetailCode",
    "radioNuclid",
    "radioNuclidCode",
    "radiopharmaceutical",
    "radiopharmaceuticalCode",
]


def projection_names(branch):
    """Split top-level SELECT expressions, keeping subquery/function commas intact."""
    projection = branch[branch.index("SELECT") + len("SELECT") :]
    depth, quoted, start = 0, False, 0
    expressions = []
    for index, char in enumerate(projection):
        if char == "'":
            quoted = not quoted
        if quoted:
            continue
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        elif depth == 0 and char == ",":
            expressions.append(projection[start:index].strip())
            start = index + 1
        elif depth == 0 and projection[index : index + 5] == "FROM ":
            expressions.append(projection[start:index].strip())
            break
    return [expression.split()[-1].split(".")[-1] for expression in expressions]


class TherapySqlTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(
            """
            CREATE TABLE Prozeduren (prozedur_id INTEGER, erkrankung_id INTEGER, reportID TEXT);
            CREATE TABLE property_catalogue_version_entry (
                code TEXT, property_version_id INTEGER, shortdesc TEXT,
                PRIMARY KEY (code, property_version_id)
            );
            """
        )
        shared = """
            id INTEGER PRIMARY KEY, intention TEXT, intention_propcat_version INTEGER,
            durchfuehrendeoe INTEGER, durchfuehrendeoe_fachabteilung INTEGER,
            beginn TEXT, ende TEXT, relation TEXT, relation_propcat_version INTEGER,
            internextern TEXT, grundabbruch TEXT, grundabbruch_propcat_version INTEGER,
            status TEXT, status_propcat_version INTEGER
        """
        self.db.execute(
            f"""CREATE TABLE dk_nuklearmedtherapie ({shared},
                therapieart TEXT, therapieart_propcat_version INTEGER,
                adtapplikationsart TEXT, adtapplikationsart_propcat_version INTEGER,
                sonstigetherapieart TEXT, sonstigetherapieart_propcat_version INTEGER,
                radionuklid TEXT, radionuklid_propcat_version INTEGER,
                radiopharmakon TEXT, radiopharmakon_propcat_version INTEGER
            )"""
        )
        self.db.execute(
            f"""CREATE TABLE dk_sonstigetherapie ({shared},
                art TEXT, art_propcat_version INTEGER,
                arterweitert TEXT, arterweitert_propcat_version INTEGER
            )"""
        )

    def catalog(self, code, version, label):
        self.db.execute(
            "INSERT INTO property_catalogue_version_entry VALUES (?, ?, ?)",
            (code, version, label),
        )

    def therapy(self, table, **fields):
        record = {
            "id": 42,
            "beginn": "2026-01-02",
            "ende": "2026-01-03",
            "internextern": "M",
            **fields,
        }
        self.db.execute(
            f"INSERT INTO {table} ({', '.join(record)}) VALUES ({', '.join('?' for _ in record)})",
            tuple(record.values()),
        )
        self.db.execute("INSERT INTO Prozeduren VALUES (?, 101, 'REPORT-TEST')", (record["id"],))
        return dict(self.db.execute(BRANCHES[table]).fetchone())

    def test_all_six_union_branches_have_identical_projection_order(self):
        self.assertEqual(len(BRANCHES), 6)
        expected = projection_names(BRANCHES["dk_nuklearmedtherapie"])
        self.assertEqual(len(expected), 32)
        self.assertEqual(expected[12:19], EXTRA_FIELDS)
        for table, branch in BRANCHES.items():
            with self.subTest(table=table):
                self.assertEqual(projection_names(branch), expected)
        final_select = SQL.split(")\nSELECT\n", 1)[1]
        for field in EXTRA_FIELDS:
            self.assertIn(f"    t.{field},", final_select)

    def test_nuclear_uses_therapy_type_and_exact_catalogue_versions(self):
        for code, version, label in [
            ("MPRRT", 1, "Old therapy label"),
            ("MPRRT", 2, "Peptid-Radio-Rezeptor-Therapie"),
            ("M", 3, "ADT application, not therapy type"),
            ("Lu-177", 4, "Old radionuclide label"),
            ("Lu-177", 5, "Lutetium (Lu-177)"),
            ("DOTA-TATE", 6, "Old pharmaceutical label"),
            ("DOTA-TATE", 7, "DOTA-TATE"),
        ]:
            self.catalog(code, version, label)
        row = self.therapy(
            "dk_nuklearmedtherapie",
            therapieart="MPRRT", therapieart_propcat_version=2,
            adtapplikationsart="M", adtapplikationsart_propcat_version=3,
            radionuklid="Lu-177", radionuklid_propcat_version=5,
            radiopharmakon="DOTA-TATE", radiopharmakon_propcat_version=7,
        )
        self.assertEqual(row["generalType"], "nuclear")
        self.assertEqual(row["subType"], "Peptid-Radio-Rezeptor-Therapie")
        self.assertEqual(row["subTypeCode"], "MPRRT")
        self.assertEqual(row["radioNuclid"], "Lutetium (Lu-177)")
        self.assertEqual(row["radioNuclidCode"], "Lu-177")
        self.assertEqual(row["radiopharmaceutical"], "DOTA-TATE")
        self.assertEqual(row["radiopharmaceuticalCode"], "DOTA-TATE")

    def test_other_resolves_type_and_preserves_standard_fields(self):
        self.catalog("TACE", 8, "Transarterielle Chemoembolisation")
        self.catalog("TACE", 9, "Wrong version")
        self.catalog("DONE", 10, "Durchgeführt")
        self.catalog("CUR", 11, "kurativ")
        self.catalog("POST", 12, "adjuvant")
        self.catalog("REG", 13, "regulär beendet")
        row = self.therapy(
            "dk_sonstigetherapie", art="TACE", art_propcat_version=8,
            status="DONE", status_propcat_version=10,
            intention="CUR", intention_propcat_version=11,
            relation="POST", relation_propcat_version=12,
            grundabbruch="REG", grundabbruch_propcat_version=13,
            durchfuehrendeoe=17, durchfuehrendeoe_fachabteilung=18,
        )
        expected = {
            "id": 42, "tumorID": 101, "reportID": "REPORT-TEST",
            "generalType": "other", "subType": "Transarterielle Chemoembolisation",
            "subTypeCode": "TACE", "status": "Durchgeführt", "intention": "kurativ",
            "surgeryContext": "adjuvant", "terminationReason": "regulär beendet",
            "therapyOccurrenceDate": "2026-01-02", "therapyEndDate": "2026-01-03",
            "internal": "internal", "durchfuehrendeoe": 17,
            "durchfuehrendeoe_fachabteilung": 18,
            "radioNuclid": None, "radioNuclidCode": None,
            "radiopharmaceutical": None, "radiopharmaceuticalCode": None,
        }
        for key, value in expected.items():
            self.assertEqual(row[key], value, key)

    def test_missing_wrong_version_or_empty_labels_fall_back_to_source_code(self):
        fields = [
            ("dk_nuklearmedtherapie", "therapieart", "subType", {}),
            ("dk_nuklearmedtherapie", "radionuklid", "radioNuclid", {}),
            ("dk_nuklearmedtherapie", "radiopharmakon", "radiopharmaceutical", {}),
            ("dk_nuklearmedtherapie", "sonstigetherapieart", "subTypeDetail", {"therapieart": "M"}),
            ("dk_sonstigetherapie", "art", "subType", {}),
            ("dk_sonstigetherapie", "arterweitert", "subTypeDetail", {"art": "A"}),
        ]
        for table, source, target, required in fields:
            for mode in ("missing", "wrong_version", "blank", "null"):
                with self.subTest(source=source, mode=mode):
                    self.db.execute("DELETE FROM property_catalogue_version_entry")
                    self.db.execute(f"DELETE FROM {table}")
                    self.db.execute("DELETE FROM Prozeduren")
                    if mode != "missing":
                        self.catalog("NEW-CODE", 99 if mode == "wrong_version" else 20,
                                     "Wrong version" if mode == "wrong_version" else "  " if mode == "blank" else None)
                    row = self.therapy(table, **required, **{
                        source: " NEW-CODE ", f"{source}_propcat_version": 20
                    })
                    self.assertEqual(row[target], "NEW-CODE")
                    self.assertEqual(row[f"{target}Code"], "NEW-CODE")

    def test_blank_values_stay_null_even_if_catalogue_has_an_empty_code(self):
        self.catalog("", 20, "Must not appear for an unanswered field")
        for table, sources in [
            ("dk_nuklearmedtherapie", ["therapieart", "radionuklid", "radiopharmakon", "sonstigetherapieart"]),
            ("dk_sonstigetherapie", ["art", "arterweitert"]),
        ]:
            with self.subTest(table=table):
                self.db.execute("DELETE FROM Prozeduren")
                fields = {field: "  " for field in sources}
                fields.update({f"{field}_propcat_version": 20 for field in sources})
                row = self.therapy(table, **fields)
                for field in ["subType", *EXTRA_FIELDS]:
                    self.assertIsNone(row[field], field)

    def test_detail_labels_are_versioned_and_only_used_for_the_relevant_type(self):
        for table, main, detail, relevant, other in [
            ("dk_nuklearmedtherapie", "therapieart", "sonstigetherapieart", "M", "MPSMA"),
            ("dk_sonstigetherapie", "art", "arterweitert", "A", "TACE"),
        ]:
            for main_code in (relevant, other):
                with self.subTest(table=table, main_code=main_code):
                    self.db.execute("DELETE FROM property_catalogue_version_entry")
                    self.db.execute(f"DELETE FROM {table}")
                    self.db.execute("DELETE FROM Prozeduren")
                    self.catalog("DETAIL", 21, "Wrong detail version")
                    self.catalog("DETAIL", 22, "Detail label")
                    row = self.therapy(table, **{
                        main: main_code, detail: "DETAIL", f"{detail}_propcat_version": 22
                    })
                    self.assertEqual(row["subTypeDetail"], "Detail label" if main_code == relevant else None)
                    self.assertEqual(row["subTypeDetailCode"], "DETAIL" if main_code == relevant else None)


if __name__ == "__main__":
    unittest.main()
