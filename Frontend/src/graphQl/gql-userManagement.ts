import { dataUrl, graphqlFetch } from './gql-url';

const localeOptions: Intl.DateTimeFormatOptions = {
	day: '2-digit',
	month: '2-digit',
	year: 'numeric'
};

export interface UserRecord {
	_id: string;
	role: string;
	createdAt: string | null;
	createdBy: string | null;
	firstLogin: string | null;
	lastLogin: string | null;
	timeOnline: number | null;
	userFilter: string[];
	pseudonymization: boolean;
	status: string;
	lastModifiedAt: string | null;
	lastModifiedBy: string | null;
	colorTheme: string;
	darkMode: boolean;
	language: string;
}

export interface UserInput {
	userFilter?: string[] | string;
	lastModifiedBy?: string;
	status?: string;
	role?: string;
	pseudonymization?: boolean;
	colorTheme?: string;
	darkMode?: boolean;
	language?: string;
	firstLogin?: number;
	lastLogin?: number;
	timeOnline?: number;
}

export const deleteUser = (userIds: string[]) => {
	const mutation = `
        mutation deleteUser($users: [String!]!) {
            deleteUser(users: $users) {
                acknowledged
                deletedCount
            }
        }
    `;

	const variables = {
		users: userIds
	};

	return graphqlFetch(dataUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			query: mutation,
			variables: variables
		})
	})
		.then((resp) => resp.json())
		.then((data) => {
			console.log('Delete user response:', data);
			const { acknowledged, deletedCount } = data.data.deleteUser;
			return { acknowledged, deletedCount };
		})
		.catch((error) => {
			console.error('Error deleting user:', error);
			throw error;
		});
};

export const updateUser = (userId: string, input: UserInput) => {
	const mutation = `
        mutation updateUser($id: String!, $input: iuser!) {
            updateUser(id: $id, input: $input) {
                acknowledged
                modifiedCount
                matchedCount
            }
        }
    `;

	const variables = {
		id: userId,
		input: input
	};

	return graphqlFetch(dataUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			query: mutation,
			variables: variables
		})
	})
		.then((resp) => resp.json())
		.then((data) => {
			console.log('Update user response:', data);
			const { acknowledged, modifiedCount, matchedCount } = data.data.updateUser;
			return { acknowledged, modifiedCount, matchedCount };
		})
		.catch((error) => {
			console.error('Error updating user:', error);
			throw error;
		});
};

export const createUser = (
	userId: string | null,
	role: string,
	email: string | null,
	firstName: string | null,
	lastName: string | null,
	createdBy: string | null
) => {
	const mutation = `
        mutation createUser($input: iuser!) {
            createUser(input: $input) {
                acknowledged
                insertedId
            }
        }
    `;

	const variables = {
		input: {
			_id: userId || null,
			email: email || null,
			firstName: firstName || null,
			lastName: lastName || null,
			createdBy: createdBy || null,
			role: role,
			status: 'inactive',
			pseudonymization: false,
			lastModifiedAt: null,
			lastModifiedBy: '',
			darkMode: false,
			colorTheme: 'CCCMunich',
			language: 'de'
		}
	};

	return graphqlFetch(dataUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			query: mutation,
			variables: variables
		})
	})
		.then((resp) => resp.json())
		.then((data) => {
			console.log('Rückgabe', data);
			const { acknowledged, insertedId } = data.data.createUser;
			return { acknowledged, insertedId };
		})
		.catch((error) => {
			console.error('Error creating user:', error);
			throw error;
		});
};

export const getUser = (
	continueFromID: string | null = null,
	limit = 1000
): Promise<UserRecord[]> => {
	return graphqlFetch(dataUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			query: `
                query getUser($continueFromID: String, $limit: Int) {
                    getUser(continueFromID: $continueFromID, limit: $limit) {
                        _id,
                        role,
                        createdAt,
                        createdBy,
                        firstLogin,
                        lastLogin,
                        timeOnline,
                        userFilter,
                        pseudonymization,
                        status,
                        lastModifiedAt,
                        lastModifiedBy,
                        colorTheme,
                        darkMode,
                        language

                    }
                }`,
			// firstName,
			// lastName,
			// email,
			variables: {
				continueFromID: continueFromID,
				limit: limit
			}
		})
	})
		.then((resp) => resp.json())
		.then((result) => {
			result.data.getUser.forEach((element: UserRecord) => {
				if (element.createdAt) {
					element.createdAt = new Date(element.createdAt).toLocaleDateString(
						'de-DE',
						localeOptions
					);
				}
				if (element.lastModifiedAt) {
					element.lastModifiedAt = new Date(element.lastModifiedAt).toLocaleDateString(
						'de-DE',
						localeOptions
					);
				}
				if (element.firstLogin) {
					element.firstLogin = new Date(element.firstLogin).toLocaleDateString(
						'de-DE',
						localeOptions
					);
				}
				if (element.lastLogin) {
					element.lastLogin = new Date(element.lastLogin).toLocaleDateString(
						'de-DE',
						localeOptions
					);
				}
			});
			return result.data.getUser;
		});
};
