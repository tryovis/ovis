import fs from 'node:fs/promises';

const patient = await fs.readFile('./sql/patient.sql', { encoding: 'utf8' });
const consultation = await fs.readFile('./sql/consultation.sql', { encoding: 'utf8' });
const diagnosis = await fs.readFile('./sql/diagnosis.sql', { encoding: 'utf8' });
const diagnostic = await fs.readFile('./sql/diagnostic.sql', { encoding: 'utf8' });
const progress = await fs.readFile('./sql/progress.sql', { encoding: 'utf8' });
const therapy = await fs.readFile('./sql/therapy.sql', { encoding: 'utf8' });
const tnm = await fs.readFile('./sql/tnm.sql', { encoding: 'utf8' });
const supplementary = await fs.readFile('./sql/supplementary.sql', { encoding: 'utf8' });
const singleRadiation = await fs.readFile('./sql/singleRadiation.sql', { encoding: 'utf8' });
const molecularMarker = await fs.readFile('./sql/molecularMarker.sql', { encoding: 'utf8' });
const metastasis = await fs.readFile('./sql/metastasis.sql', { encoding: 'utf8' });
const status = await fs.readFile('./sql/status.sql', { encoding: 'utf8' });
const histology = await fs.readFile('./sql/histology.sql', { encoding: 'utf8' });
const tumorBoard = await fs.readFile('./sql/tumorBoard.sql', { encoding: 'utf8' });

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
