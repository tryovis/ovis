import { dataUrl, graphqlFetch } from './gql-url';

export const getQuicktoolsBasicsIcd10 = async () => {
    const res = await graphqlFetch(dataUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            query: `query {
                getQuicktoolsBasicsIcd10
            }`
        }),
    });

    if (res.ok) {
        let variable = await res.json();
        return variable.data.getQuicktoolsBasicsIcd10;
    } else {
        throw new Error("GetCountOf GQL Error");
    }
};

export const getQuicktoolsBasicsHistology = async () => {
    const res = await graphqlFetch(dataUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            query: `query {
                getQuicktoolsBasicsHistology
            }`
        }),
    });

    if (res.ok) {
        let variable = await res.json();
        return variable.data.getQuicktoolsBasicsHistology;
    } else {
        throw new Error("GetCountOf GQL Error");
    }
};

export const getQuicktoolsCountOverview = async (filter: string) => {
    const res = await graphqlFetch(dataUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            query: `query getQuicktoolsCountOverview($getCountOfCollection: [collection]!, $filter: String!) {
                getQuicktoolsCountOverview(collection: $getCountOfCollection, filter: $filter) {
                    collection,
                    count
                }
            }`,
            variables: {
                "getCountOfCollection": [
                    "patient",
                    "therapy",
                    "diagnosis",
                    "progress"
                ],
                "filter": filter 
            }
        }),
    });

    if (res.ok) {
        let variable = await res.json();
        return variable.data.getQuicktoolsCountOverview;
    } else {
        throw new Error("getQuicktoolsCountOverview GQL Error");
    }
};
