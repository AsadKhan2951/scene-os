import type { Frame } from './types';

/** A frame's picture: the AI Director's realistic render when there is one, else the sketch. */
export const picture = (f: Pick<Frame, 'imageUrl' | 'render'>) => f.render?.url || f.imageUrl;
