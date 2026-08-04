import fs from 'node:fs/promises';

const PATIENT_MASTER_FILTER =
	/\/\* patient master filter \*\/\s*((?:[A-Za-z_]\w*\.)?personenstamm)\s*=\s*4/g;

function parsePatientMasters(value) {
	if (value === undefined) return ['4'];
	if (value.trim() === '') return [];

	const values = value.split(',').map((entry) => entry.trim());
	if (values.some((entry) => !/^[1-9]\d*$/.test(entry))) {
		throw new Error(
			'ONKOSTAR_PATIENTENSTAEMME must be empty or contain comma-separated positive integers'
		);
	}

	return [...new Set(values)];
}

const patientMasters = parsePatientMasters(process.env.ONKOSTAR_PATIENTENSTAEMME);

async function readSql(fileName) {
	const sql = await fs.readFile(`./sql/${fileName}`, { encoding: 'utf8' });

	return sql.replace(PATIENT_MASTER_FILTER, (_filter, column) => {
		if (patientMasters.length === 0) return '/* patient master filter */ 1 = 1';
		if (patientMasters.length === 1) {
			return `/* patient master filter */ ${column} = ${patientMasters[0]}`;
		}

		return `/* patient master filter */ ${column} IN (${patientMasters.join(', ')})`;
	});
}

const patient = await readSql('patient.sql');
const consultation = await readSql('consultation.sql');
const diagnosis = await readSql('diagnosis.sql');
const diagnostic = await readSql('diagnostic.sql');
const progress = await readSql('progress.sql');
const therapy = await readSql('therapy.sql');
const tnm = await readSql('tnm.sql');
const supplementary = await readSql('supplementary.sql');
const singleRadiation = await readSql('singleRadiation.sql');
const molecularMarker = await readSql('molecularMarker.sql');
const metastasis = await readSql('metastasis.sql');
const status = await readSql('status.sql');
const histology = await readSql('histology.sql');
const useWuerzburgTumorBoard =
	process.env.wuerzburgTBExtension?.trim().toLowerCase() === 'true';
const tumorBoard = await readSql(
	useWuerzburgTumorBoard ? 'tumorBoardWuerzburg.sql' : 'tumorBoard.sql'
);

export const states = {
	patient,
	tnm,
	therapy,
	progress,
	diagnostic,
	diagnosis,
	consultation,
	supplementary,
	singleRadiation,
	molecularMarker,
	metastasis,
	status,
	histology,
	tumorBoard
};
