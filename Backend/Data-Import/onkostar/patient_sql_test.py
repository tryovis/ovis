"""Execute patient.sql against synthetic fixtures without an Onkostar connection.

SQLite evaluates the actual query's joins, windows and date/source selection.
ISO date strings preserve DATE ordering; CONCAT is registered with MariaDB's
NULL behavior. This does not validate MariaDB driver or deployment behavior.
"""

from pathlib import Path
import sqlite3
import unittest


SQL = (Path(__file__).parent / "sql" / "patient.sql").read_text(encoding="utf-8")
OLD_SOURCES = (
    "abschluss", "letzteinformation", "letzteinfodoku",
    "letzteinfokrankheit", "letzterverlauf",
)


class PatientSqlTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.row_factory = sqlite3.Row
        self.db.create_function(
            "CONCAT", -1,
            lambda *args: None if None in args else "".join(map(str, args)),
        )
        self.db.executescript("""
            CREATE TABLE patient (
                id INTEGER PRIMARY KEY, patienten_id TEXT, personenstamm INTEGER,
                angelegt_am TEXT, mpi_id INTEGER, letzte_information TEXT,
                sterbedatum TEXT, ort TEXT, postleitzahl TEXT, staat_id TEXT,
                geburtsdatum TEXT, geschlecht TEXT, vorname TEXT, nachname TEXT
            );
            CREATE TABLE erkrankung (mpi_id INTEGER);
            CREATE TABLE prozedur (id INTEGER PRIMARY KEY, patient_id INTEGER, geloescht INTEGER);
            CREATE TABLE dk_abschluss (
                id INTEGER PRIMARY KEY, letzterkontakt TEXT, sterbedatum TEXT,
                status TEXT, status_propcat_version INTEGER, todtumorbedingt TEXT,
                todtumorbedingt_propcat_version INTEGER
            );
            CREATE TABLE dk_bestoftumor (
                id INTEGER PRIMARY KEY, letzteinformation TEXT, letzteinfodoku TEXT,
                letzteinfokrankheit TEXT, letzterverlauf TEXT, sterbedatum TEXT
            );
            CREATE TABLE property_catalogue_version_entry (
                code TEXT, property_version_id INTEGER, shortdesc TEXT
            );
            CREATE TABLE land (kuerzel TEXT);
            INSERT INTO property_catalogue_version_entry VALUES ('V', 1, 'Verstorben');
            INSERT INTO property_catalogue_version_entry VALUES ('1', 2, 'Ja');
        """)
        self.next_id = 0

    def insert(self, table, **fields):
        self.db.execute(
            f"INSERT INTO {table} ({', '.join(fields)}) "
            f"VALUES ({', '.join('?' for _ in fields)})",
            tuple(fields.values()),
        )

    def patient(self, **fields):
        self.next_id += 1
        record = {
            "id": self.next_id, "patienten_id": f"SYNTHETIC-{self.next_id}",
            "personenstamm": 4, "angelegt_am": "2026-01-01", "mpi_id": self.next_id,
            "ort": "Synthetic town", "vorname": "Synthetic", "nachname": "Fixture",
            **fields,
        }
        self.insert("patient", **record)
        self.insert("erkrankung", mpi_id=record["mpi_id"])
        return record

    def document(self, table, patient, deleted=0, **fields):
        self.next_id += 1
        self.insert("prozedur", id=self.next_id, patient_id=patient["id"], geloescht=deleted)
        self.insert(table, id=self.next_id, **fields)

    def old_source(self, source, patient, date, **fields):
        if source == "abschluss":
            self.document("dk_abschluss", patient, letzterkontakt=date, **fields)
        else:
            self.document("dk_bestoftumor", patient, **{source: date}, **fields)

    def result(self, patient, masters=None):
        sql = SQL
        if masters is not None:
            # Exercise the same query with another configured WHERE predicate.
            # sqlStatements.test.mjs separately covers environment substitution.
            marker = "/* patient master filter */ personenstamm = 4"
            self.assertIn(marker, sql)
            predicate = f"personenstamm IN ({', '.join(map(str, masters))})" if masters else "1 = 1"
            sql = sql.replace(marker, f"/* patient master filter */ {predicate}")
        rows = [dict(row) for row in self.db.execute(sql)
                if row["patID"] == patient["patienten_id"]]
        self.assertEqual(len(rows), 1)
        return rows[0]

    def assert_vital(self, patient, date, source, **query_options):
        row = self.result(patient, **query_options)
        self.assertEqual(row["vitalDate"], date)
        self.assertEqual(row["vitalState"], f"Am Leben ({source})")

    def test_newer_kis_beats_multiple_older_abschluss_documents(self):
        patient = self.patient(letzte_information="2026-08-12")
        self.old_source("abschluss", patient, "2024-04-23")
        self.old_source("abschluss", patient, "2024-04-16")
        self.assert_vital(patient, "2026-08-12", "KIS")

    def test_kis_and_best_of_information_are_distinct_date_sources(self):
        patient = self.patient(letzte_information="2026-07-27")
        self.old_source("letzteinformation", patient, "2026-07-24")
        self.old_source("abschluss", patient, "2024-05-14")
        self.old_source("abschluss", patient, "2024-05-27")
        self.assert_vital(patient, "2026-07-27", "KIS")

    def test_older_equal_newer_and_null_kis_against_each_existing_source(self):
        for source in OLD_SOURCES:
            for kis in (None, "2026-06-01", "2026-07-01", "2026-08-01"):
                with self.subTest(source=source, kis=kis):
                    patient = self.patient(letzte_information=kis)
                    self.old_source(source, patient, "2026-07-01")
                    wins = kis == "2026-08-01"
                    self.assert_vital(patient, kis if wins else "2026-07-01", "KIS" if wins else source)

    def test_kis_is_used_when_documents_are_absent_or_have_no_dates(self):
        for empty_documents in (False, True):
            with self.subTest(empty_documents=empty_documents):
                patient = self.patient(letzte_information="2026-08-01")
                if empty_documents:
                    self.document("dk_abschluss", patient)
                    self.document("dk_bestoftumor", patient)
                self.assert_vital(patient, "2026-08-01", "KIS")

    def test_all_missing_dates_keep_unknown_date_and_source(self):
        patient = self.patient()
        self.document("dk_abschluss", patient)
        self.document("dk_bestoftumor", patient)
        self.assert_vital(patient, None, "keine Quelle")

    def test_existing_tie_priority_is_preserved_with_equal_kis(self):
        for first in range(len(OLD_SOURCES)):
            with self.subTest(expected=OLD_SOURCES[first]):
                patient = self.patient(letzte_information="2026-07-01")
                for source in OLD_SOURCES[first:]:
                    self.old_source(source, patient, "2026-07-01")
                self.assert_vital(patient, "2026-07-01", OLD_SOURCES[first])

    def test_existing_sources_still_compete_with_each_other_and_kis(self):
        for winner in OLD_SOURCES:
            with self.subTest(winner=winner):
                patient = self.patient(letzte_information="2026-07-01")
                for source in OLD_SOURCES:
                    self.old_source(source, patient, "2026-08-01" if source == winner else "2026-06-01")
                self.assert_vital(patient, "2026-08-01", winner)

    def test_kis_uses_all_selected_master_rows_but_keeps_newest_demographics(self):
        patient = self.patient(patienten_id="SYNTHETIC-DUPLICATE", letzte_information="2026-08-01")
        self.patient(patienten_id=patient["patienten_id"], angelegt_am="2026-02-01",
                     letzte_information="2026-06-01", ort="Newest selected town", vorname="Newest")
        self.patient(patienten_id=patient["patienten_id"], angelegt_am="2026-03-01",
                     personenstamm=7, letzte_information="2026-09-01", ort="Excluded town")
        row = self.result(patient)
        self.assertEqual(row["vitalDate"], "2026-08-01")
        self.assertEqual(row["vitalState"], "Am Leben (KIS)")
        self.assertEqual(row["area"], "Newest selected town")
        self.assertEqual(row["firstName"], "Newest")

    def test_configured_multiple_or_all_masters_include_their_kis_dates(self):
        patient = self.patient(patienten_id="SYNTHETIC-MASTERS", letzte_information="2026-06-01")
        self.patient(patienten_id=patient["patienten_id"], personenstamm=7,
                     angelegt_am="2026-02-01", letzte_information="2026-08-01")
        self.patient(patienten_id=patient["patienten_id"], personenstamm=9,
                     angelegt_am="2026-03-01", letzte_information="2026-09-01")
        self.assert_vital(patient, "2026-08-01", "KIS", masters=(4, 7))
        self.assert_vital(patient, "2026-09-01", "KIS", masters=())

    def test_deleted_documents_do_not_override_kis_or_create_death(self):
        patient = self.patient(letzte_information="2026-07-01")
        self.document("dk_abschluss", patient, deleted=1, letzterkontakt="2026-08-01",
                      sterbedatum="2026-06-01", status="V")
        self.document("dk_bestoftumor", patient, deleted=1, letzteinformation="2026-09-01",
                      sterbedatum="2026-06-02")
        self.assert_vital(patient, "2026-07-01", "KIS")

    def test_each_death_date_source_still_overrides_newer_kis(self):
        for source in ("patient", "dk_abschluss", "dk_bestoftumor"):
            with self.subTest(source=source):
                patient = self.patient(letzte_information="2026-08-01",
                                       **({"sterbedatum": "2026-05-01"} if source == "patient" else {}))
                if source != "patient":
                    self.document(source, patient, sterbedatum="2026-05-01")
                row = self.result(patient)
                self.assertEqual(row["vitalDate"], "2026-05-01")
                self.assertEqual(row["vitalState"], "Verstorben (Tumorbedingt: Unbekannt)")

    def test_death_source_priority_and_coded_death_status_are_preserved(self):
        patient = self.patient(letzte_information="2026-08-01", sterbedatum="2026-05-01")
        self.document("dk_abschluss", patient, sterbedatum="2026-05-02", status="V",
                      status_propcat_version=1, todtumorbedingt="1", todtumorbedingt_propcat_version=2)
        self.document("dk_bestoftumor", patient, sterbedatum="2026-05-03")
        row = self.result(patient)
        self.assertEqual(row["vitalDate"], "2026-05-01")
        self.assertEqual(row["vitalState"], "Verstorben (Tumorbedingt: Ja)")
        self.db.execute("UPDATE patient SET sterbedatum = NULL WHERE id = ?", (patient["id"],))
        self.assertEqual(self.result(patient)["vitalDate"], "2026-05-02")

    def test_free_text_death_status_is_preserved(self):
        patient = self.patient(letzte_information="2026-08-01")
        self.document("dk_abschluss", patient, sterbedatum="2026-05-01",
                      status="Verstorben (synthetischer Status)")
        row = self.result(patient)
        self.assertEqual(row["vitalDate"], "2026-05-01")
        self.assertEqual(row["vitalState"], "Verstorben (synthetischer Status)")


if __name__ == "__main__":
    unittest.main()
