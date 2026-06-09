import fs from 'node:fs/promises';

const patient = await fs.readFile('./mgDB/prep/sql/patient.sql', { encoding: 'utf8' });
const consultation = await fs.readFile('./mgDB/prep/sql/consultation.sql', { encoding: 'utf8' });
const diagnosis = await fs.readFile('./mgDB/prep/sql/diagnosis.sql', { encoding: 'utf8' });
const diagnostic = await fs.readFile('./mgDB/prep/sql/diagnostic.sql', { encoding: 'utf8' });
const progress = await fs.readFile('./mgDB/prep/sql/progress.sql', { encoding: 'utf8' });
const therapy = await fs.readFile('./mgDB/prep/sql/therapy.sql', { encoding: 'utf8' });
const tnm = await fs.readFile('./mgDB/prep/sql/tnm.sql', { encoding: 'utf8' });
const supplementary = await fs.readFile('./mgDB/prep/sql/supplementary.sql', { encoding: 'utf8' });
const singleRadiation = await fs.readFile('./mgDB/prep/sql/singleRadiation.sql', {
	encoding: 'utf8'
});
const molecularMarker = await fs.readFile('./mgDB/prep/sql/molecularMarker.sql', {
	encoding: 'utf8'
});
const metastasis = await fs.readFile('./mgDB/prep/sql/metastasis.sql', { encoding: 'utf8' });
const status = await fs.readFile('./mgDB/prep/sql/status.sql', { encoding: 'utf8' });
const histology = await fs.readFile('./mgDB/prep/sql/histology.sql', { encoding: 'utf8' });
const kaplanMeier = await fs.readFile('./mgDB/prep/sql/kaplanMeier.sql', { encoding: 'utf8' });
const tumorBoard = await fs.readFile('./mgDB/prep/sql/tumorBoard.sql', { encoding: 'utf8' });

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
	kaplanMeier,
	tumorBoard
};
