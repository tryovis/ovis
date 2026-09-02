const TOOLTIP_GAP = 4;
const POINTER_TOOLTIP_GAP = 12;
const VIEWPORT_INSET = 12;
const TOOLTIP_Z_INDEX = 10000;

/**
 * Keep a tooltip inside the viewport while anchoring it to its trigger.
 *
 * @param {{ left: number, right: number, top: number, bottom: number, width: number, height: number }} rect
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 */
export function createViewportTooltipStyle(rect, viewportWidth, viewportHeight) {
	const opensLeft = rect.left + rect.width / 2 > viewportWidth / 2;
	const opensAbove = rect.top + rect.height / 2 > viewportHeight / 2;
	const horizontalPosition = opensLeft
		? `left:auto;right:${Math.max(VIEWPORT_INSET, viewportWidth - rect.right)}px;`
		: `left:${Math.max(VIEWPORT_INSET, rect.left)}px;right:auto;`;
	const verticalPosition = opensAbove
		? `top:auto;bottom:${Math.max(VIEWPORT_INSET, viewportHeight - rect.top + TOOLTIP_GAP)}px;`
		: `top:${Math.max(VIEWPORT_INSET, rect.bottom + TOOLTIP_GAP)}px;bottom:auto;`;

	return `position:fixed;z-index:${TOOLTIP_Z_INDEX};margin:0;transform:none;${horizontalPosition}${verticalPosition}`;
}

/**
 * Keep a tooltip inside the viewport while positioning it next to the pointer.
 *
 * @param {number} pointerX
 * @param {number} pointerY
 * @param {{ width: number, height: number }} tooltipSize
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 */
export function createPointerTooltipStyle(
	pointerX,
	pointerY,
	tooltipSize,
	viewportWidth,
	viewportHeight
) {
	const preferredLeft =
		pointerX + POINTER_TOOLTIP_GAP + tooltipSize.width <= viewportWidth - VIEWPORT_INSET
			? pointerX + POINTER_TOOLTIP_GAP
			: pointerX - tooltipSize.width - POINTER_TOOLTIP_GAP;
	const preferredTop =
		pointerY + POINTER_TOOLTIP_GAP + tooltipSize.height <= viewportHeight - VIEWPORT_INSET
			? pointerY + POINTER_TOOLTIP_GAP
			: pointerY - tooltipSize.height - POINTER_TOOLTIP_GAP;
	const maxLeft = Math.max(VIEWPORT_INSET, viewportWidth - tooltipSize.width - VIEWPORT_INSET);
	const maxTop = Math.max(VIEWPORT_INSET, viewportHeight - tooltipSize.height - VIEWPORT_INSET);
	const left = Math.min(Math.max(VIEWPORT_INSET, preferredLeft), maxLeft);
	const top = Math.min(Math.max(VIEWPORT_INSET, preferredTop), maxTop);

	return `display:block;visibility:visible;position:fixed;z-index:${TOOLTIP_Z_INDEX};margin:0;transform:none;left:${Math.round(
		left
	)}px;right:auto;top:${Math.round(top)}px;bottom:auto;`;
}

/** @param {MouseEvent | FocusEvent} event */
export function showViewportTooltip(event) {
	if (typeof window === 'undefined' || typeof HTMLElement === 'undefined') return '';
	const trigger = event.currentTarget;
	if (!(trigger instanceof HTMLElement)) return '';
	const tooltip = trigger.querySelector('.tooltiptext');
	if (!(tooltip instanceof HTMLElement)) return '';

	const tooltipStyle = createViewportTooltipStyle(
		trigger.getBoundingClientRect(),
		window.innerWidth,
		window.innerHeight
	);
	tooltip.setAttribute('style', tooltipStyle);

	if (typeof tooltip.showPopover === 'function') {
		tooltip.setAttribute('popover', 'manual');
		if (!tooltip.matches(':popover-open')) tooltip.showPopover();
	}
	trigger.addEventListener('mouseleave', () => hideTooltipForTrigger(trigger), { once: true });

	return tooltipStyle;
}

/** @param {HTMLElement} trigger */
function hideTooltipForTrigger(trigger) {
	const tooltip = trigger.querySelector('.tooltiptext');
	if (!(tooltip instanceof HTMLElement) || typeof tooltip.hidePopover !== 'function') return;
	if (tooltip.matches(':popover-open')) tooltip.hidePopover();
}
