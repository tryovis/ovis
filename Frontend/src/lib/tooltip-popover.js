const TOOLTIP_GAP = 4;
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
