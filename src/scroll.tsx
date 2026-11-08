import {useEffect, useRef, useState, type ReactNode} from 'react';
import {Box, measureElement, type DOMElement} from 'ink';

// Scrolling for content taller than the terminal. Ink has no scroll container, so the viewport is a
// box that fills the space left over and clips its children, shifted up by `offset` rows.
export function useScroll() {
	const [requested, setRequested] = useState(0);
	const [size, setSize] = useState({viewport: 0, content: 0});
	const max = Math.max(0, size.content - size.viewport);
	const offset = Math.min(requested, max);
	return {
		offset,
		max,
		overflowing: max > 0,
		viewport: size.viewport,
		measured: setSize,
		by: (rows: number) => setRequested(Math.max(0, Math.min(max, offset + rows))),
		to: (row: number) => setRequested(Math.max(0, Math.min(max, row))),
	};
}

export type Scroll = ReturnType<typeof useScroll>;

export function ScrollView({scroll, children}: {scroll: Scroll; children: ReactNode}) {
	const viewport = useRef<DOMElement>(null);
	const content = useRef<DOMElement>(null);
	const {measured} = scroll;

	// Layout is ready by the time effects run; re-measure after every render and only update on a change.
	useEffect(() => {
		if (!viewport.current || !content.current) return;
		const next = {viewport: measureElement(viewport.current).height, content: measureElement(content.current).height};
		measured(prev => (prev.viewport === next.viewport && prev.content === next.content ? prev : next));
	});

	return (
		<Box ref={viewport} flexDirection="column" flexShrink={1} overflow="hidden" contentOffsetY={scroll.offset}>
			<Box ref={content} flexDirection="column" flexShrink={0}>
				{children}
			</Box>
		</Box>
	);
}
