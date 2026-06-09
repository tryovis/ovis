const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { ApolloServerPluginDrainHttpServer } = require('@apollo/server/plugin/drainHttpServer');
const express = require('express');
const http = require('http');
const cors = require('cors');
const { json } = require('body-parser');
const { closeConnection, establishConnection, oncdb } = require('./monConnector.js');

const resolver = require('./resolver/resolver');
const tumorResolver = require('./resolver/tumor.js');
const therapyResolver = require('./resolver/therapy.js');
const metaResovler = require('./resolver/meta.js');
const kpResolver = require('./resolver/kaplanMeier.js');
const fstAss = require('./resolver/diagnosis.js');
const patInfoResolver = require('./resolver/patient.js');
const coursesResolver = require('./resolver/progress.js');
const tnmResolver = require('./resolver/tnmMetastases.js');
const followupResolver = require('./resolver/followUp.js');
const splyResovler = require('./resolver/supplementary.js');

const typedefs = require('./schema/schema.graphql');
const diag = require('./schema/diagnostic.graphql');
const FirstAssessment = require('./schema/diagnosis.graphql');
const patInfo = require('./schema/patient.graphql');
const tumor = require('./schema/tumor.graphql');
const therapy = require('./schema/therapy.graphql');
const courses = require('./schema/progress.graphql');
const schema = require('./schema/schema.graphql');
const meta = require('./schema/meta.graphql');
const kp = require('./schema/kaplanMeier.graphql');
const tnm = require('./schema/tnmMetastase.graphql');
const stdy = require('./schema/study.graphql');
const followup = require('./schema/followUp.graphql');
const spplmntry = require('./schema/supplementary.graphql');

const PORT = process.env.PORT || 4001;
const source = process.env.SOURCE;
const dbName = process.env.DB;
const nodeEnv = process.env.NODE_ENV;
const APOLLOPATH = '/graphql';

const COLLECTIONS = {
	usr: 'user',
	supplementary: 'supplementary',
	molecularmarker: 'molecularMarker',
	diagnosis: 'diagnosis',
	kaplanmeier: 'kaplanMeier',
	patient: 'patient',
	metastasis: 'metastasis',
	consultation: 'consultation',
	tumorBoard: 'tumorBoard',
	progress: 'progress',
	therapy: 'therapy',
	tnm: 'tnm',
	ops: 'ops',
	diagnostic: 'diagnostic',
	followup: 'followUp',
	study: 'study',
	bioMaterial: 'bioMaterial',
	status: 'status'
};

const resolvers = [
	resolver,
	metaResovler,
	tumorResolver,
	therapyResolver,
	kpResolver,
	fstAss,
	patInfoResolver,
	coursesResolver,
	tnmResolver,
	followupResolver,
	splyResovler
];

const typeDefs = [
	schema,
	meta,
	typedefs,
	FirstAssessment,
	diag,
	patInfo,
	tumor,
	therapy,
	courses,
	kp,
	tnm,
	followup,
	stdy,
	spplmntry
];

let apolloExpress;

async function startApolloServer() {
	console.log('source:', source);
	console.log('db:', dbName);
	console.log('node:', nodeEnv);

	const app = express();
	const httpServer = http.createServer(app);

	const server = new ApolloServer({
		typeDefs,
		resolvers,
		plugins: [ApolloServerPluginDrainHttpServer({ httpServer })]
	});
	await server.start();

	// ✅ WICHTIG: body-parser default (100kb) führt sonst zu 413 bei großen Filters/ASTs
	app.use(
		APOLLOPATH,
		cors(),
		json({ limit: '50mb' }),
		expressMiddleware(server, {
			context: async ({ req }) => {
				return {
					...req,
					db: await establishConnection(dbName),
					collections: COLLECTIONS
				};
			}
		})
	);

	app.get('/', (req, res) => {
		console.log('Apollo graphQl Express server is ready');
		res.status(200).send('OK');
	});

	apolloExpress = httpServer.listen({ port: PORT }, () => {
		console.log(`🦜Server is running at localhost:${PORT}${APOLLOPATH}`);
	});
}

process.on('SIGTERM', () => {
	console.log('close on sigterm');
	closeConnection();
	if (apolloExpress) apolloExpress.close();
});

startApolloServer();
