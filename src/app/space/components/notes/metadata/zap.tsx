import { compactNumber } from "@utils/number";
import { useState } from "react";

export function NoteZap({ zaps }: { zaps: number }) {
	const [count, setCount] = useState(zaps);

	return (
		<button type="button" className="group inline-flex items-center gap-1.5">
			<span className="text-base leading-none text-zinc-400 group-hover:text-white">
				{compactNumber.format(count)} sats zapped
			</span>
		</button>
	);
}