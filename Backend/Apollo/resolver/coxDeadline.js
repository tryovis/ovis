const { GraphQLError } = require('graphql');

const COX_TIMEOUT_MS = 60_000;
const coxTimeoutError = () =>
	new GraphQLError(
		'Cox regression timed out after 60 seconds. Please narrow the cohort or try again later.',
		{ extensions: { code: 'COX_TIMEOUT' } }
	);

const createCoxDeadline = (timeoutMs = COX_TIMEOUT_MS) => {
	const expiresAt = performance.now() + timeoutMs;
	return {
		remaining() {
			const remaining = Math.ceil(expiresAt - performance.now());
			if (remaining <= 0) throw coxTimeoutError();
			return remaining;
		}
	};
};

module.exports = { COX_TIMEOUT_MS, coxTimeoutError, createCoxDeadline };
