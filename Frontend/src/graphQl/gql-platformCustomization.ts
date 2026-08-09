import { dataUrl, graphqlFetch } from './gql-url';

export type PlatformLanguage = 'de' | 'en';
export type PlatformDocumentType = 'USER_AGREEMENT' | 'DATA_ACCESS';

export type PlatformDocumentInfo = {
	type: PlatformDocumentType;
	language: PlatformLanguage;
	filename: string;
	contentType: string;
	size: number;
	updatedAt: number;
	updatedBy?: string | null;
};

export type PlatformConfiguration = {
	colorTheme: string;
	colorPalette: string[];
	systemLanguage: PlatformLanguage;
	source: 'ENVIRONMENT' | 'DATABASE';
	updatedAt?: number | null;
	updatedBy?: string | null;
	documents: PlatformDocumentInfo[];
};

type PlatformConfigurationInput = Pick<
	PlatformConfiguration,
	'colorTheme' | 'colorPalette' | 'systemLanguage'
> & { updatedBy?: string };

async function platformQuery<T>(
	query: string,
	variables: Record<string, unknown> = {}
): Promise<T> {
	const response = await graphqlFetch(dataUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query, variables })
	});
	const result = await response.json();
	if (result.errors?.length) throw new Error(result.errors[0].message);
	return result.data;
}

const configurationFields = `
	colorTheme colorPalette systemLanguage source updatedAt updatedBy
	documents { type language filename contentType size updatedAt updatedBy }
`;

export async function getPlatformConfiguration(): Promise<PlatformConfiguration> {
	const data = await platformQuery<{ getPlatformConfiguration: PlatformConfiguration }>(
		`query getPlatformConfiguration { getPlatformConfiguration { ${configurationFields} } }`
	);
	return data.getPlatformConfiguration;
}

export async function updatePlatformConfiguration(
	input: PlatformConfigurationInput
): Promise<PlatformConfiguration> {
	const data = await platformQuery<{ updatePlatformConfiguration: PlatformConfiguration }>(
		`mutation updatePlatformConfiguration($input: PlatformConfigurationInput!) {
			updatePlatformConfiguration(input: $input) { ${configurationFields} }
		}`,
		{ input }
	);
	return data.updatePlatformConfiguration;
}

export async function uploadPlatformDocument(input: {
	type: PlatformDocumentType;
	language: PlatformLanguage;
	filename: string;
	contentType: string;
	dataBase64: string;
	updatedBy?: string;
}): Promise<PlatformDocumentInfo> {
	const data = await platformQuery<{ uploadPlatformDocument: PlatformDocumentInfo }>(
		`mutation uploadPlatformDocument($input: PlatformDocumentInput!) {
			uploadPlatformDocument(input: $input) {
				type language filename contentType size updatedAt updatedBy
			}
		}`,
		{ input }
	);
	return data.uploadPlatformDocument;
}
