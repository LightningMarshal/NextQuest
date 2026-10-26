import Image, { type ImageProps } from "next/image";

import { isOptimizableImage } from "@/lib/images";

/**
 * next/image for game art: provider hosts go through the optimizer; any
 * other URL (a pasted cover) is served as-is so /_next/image never proxies
 * arbitrary hosts (see src/lib/images.ts).
 */
export function GameArt({ src, alt, ...props }: Omit<ImageProps, "src"> & { src: string }) {
	return <Image src={src} alt={alt} unoptimized={!isOptimizableImage(src)} {...props} />;
}
