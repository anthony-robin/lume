import { NDKCacheUserProfile } from "@lume/types";
import { ReactNode } from "react";
import ReactDOM from "react-dom";
import { BaseEditor, Transforms } from "slate";
import { ReactEditor } from "slate-react";

export const Portal = ({ children }: { children?: ReactNode }) => {
	return typeof document === "object"
		? ReactDOM.createPortal(children, document.body)
		: null;
};

export const isImageUrl = (url: string) => {
	try {
		if (!url) return false;
		const ext = new URL(url).pathname.split(".").pop();
		return ["jpg", "jpeg", "gif", "png", "webp", "avif", "tiff"].includes(ext);
	} catch {
		return false;
	}
};

export const insertImage = (editor: ReactEditor | BaseEditor, url: string) => {
	const text = { text: "" };
	const image = [
		{
			type: "image",
			url,
			children: [text],
		},
	];
	const extraText = [
		{
			type: "paragraph",
			children: [text],
		},
	];

	// @ts-ignore, idk
	ReactEditor.focus(editor);
	Transforms.insertNodes(editor, image);
	Transforms.insertNodes(editor, extraText);
};

export const insertMention = (
	editor: ReactEditor | BaseEditor,
	contact: NDKCacheUserProfile,
) => {
	const text = { text: "" };
	const mention = {
		type: "mention",
		npub: `nostr:${contact.npub}`,
		name: contact.name || contact.displayName || "anon",
		children: [text],
	};
	const extraText = [
		{
			type: "paragraph",
			children: [text],
		},
	];

	// @ts-ignore, idk
	ReactEditor.focus(editor);
	Transforms.insertNodes(editor, mention);
	Transforms.insertNodes(editor, extraText);
};

export const insertNostrEvent = (
	editor: ReactEditor | BaseEditor,
	eventId: string,
) => {
	const text = { text: "" };
	const event = [
		{
			type: "event",
			eventId: `nostr:${eventId}`,
			children: [text],
		},
	];
	const extraText = [
		{
			type: "paragraph",
			children: [text],
		},
	];

	Transforms.insertNodes(editor, event);
	Transforms.insertNodes(editor, extraText);
};
