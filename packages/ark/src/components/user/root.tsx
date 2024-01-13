import { cn } from "@lume/utils";
import { ReactNode } from "react";

export function UserRoot({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return <div className={cn(className)}>{children}</div>;
}
