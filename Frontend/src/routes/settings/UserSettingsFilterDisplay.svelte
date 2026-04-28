<script lang="ts">
    import { userStore } from '../../store/userStore';
    import { updateUser } from '../../graphQl/gql-userManagement';
    import { onMount } from 'svelte';

    let currentUser = "";
    let darkMode: boolean;
    let userFilters: any = null;

    onMount(() => {
        userStore.subscribe((value: any) => {
            ({ currentUser, darkMode } = value);
            userFilters = value?.currentFilter ? JSON.parse(value.currentFilter) : null;
        });
    });

    function parseUserFilter(filterx) {
        if (!filterx || typeof filterx !== "object" || !filterx.children || filterx.children.length === 0) {
            return "<span style='color: gray;'>No Filters</span>";
        }

        return `
            <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 5px;">
                ${filterx.children.map((andNode, andIndex) => `
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        ${andNode.children.map((orNode, orIndex) => `
                            <div>
                                <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; white-space: nowrap;">
                                    <div style="width: 100px; font-weight: bold; overflow: hidden; text-overflow: ellipsis;">
                                        ${orNode.children[0]?.key || "Unknown"}
                                    </div>
                                    <div style="width: 20px; text-align: center;">→</div>
                                    <div style="width: 120px; overflow: hidden; text-overflow: ellipsis;">
                                        ${orNode.children.map(child => parseNode(child)).join(', ')}
                                    </div>
                                </div>
                                ${orIndex < andNode.children.length - 1 ? `<hr style="border: none; border-top: 1px solid lightgray; margin: 3px 0;">` : ""}
                            </div>
                        `).join('')}
                    </div>
                    ${andIndex < filterx.children.length - 1 ? `<hr style="border: none; border-top: 2px solid gray; margin: 5px 0;">` : ""}
                `).join('')}
            </div>
        `;
    }

    function parseNode(node) {
        if (node.type === "EQUALS") {
            return truncateValue(node.value);
        } else if (node.type === "BETWEEN" && node.value?.min !== undefined && node.value?.max !== undefined) {
            if (node.key?.toLowerCase().includes("date")) {
                return `${formatMillisecondsToDate(node.value.min)} - ${formatMillisecondsToDate(node.value.max)}`;
            }
            return `${truncateValue(node.value.min)} - ${truncateValue(node.value.max)}`;
        }
        return "";
    }

    function formatMillisecondsToDate(milliseconds) {
        const date = new Date(milliseconds);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    }

    function truncateValue(value) {
        return value.length > 10 ? value.slice(0, 10) + "..." : value;
    }
</script>

<label class="custom-label" for="colorPicker"><b>Filter:</b></label>
<div class="themediv">
    {@html parseUserFilter(userFilters)}
</div>

<style>
    .themediv {
        display: flex;
        align-items: center;
        margin-left: 100px;
        flex-direction: column;
        width: 300px;
        border: 1px solid #ccc;
        padding: 10px;
        background-color: var(--background);
    }
</style>
