import { DarkIcon, LightIcon, SystemModeIcon } from "@lume/icons";
import { useStorage } from "@lume/storage";
import { cn } from "@lume/utils";
import * as Switch from "@radix-ui/react-switch";
import { invoke } from "@tauri-apps/api/core";
import { getCurrent } from "@tauri-apps/api/window";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import {
	isPermissionGranted,
	requestPermission,
} from "@tauri-apps/plugin-notification";
import { useEffect, useState } from "react";

export function GeneralSettingScreen() {
	const storage = useStorage();

	const [apiKey, setAPIKey] = useState("");
	const [settings, setSettings] = useState({
		lowPower: false,
		autoupdate: false,
		autolaunch: false,
		outbox: false,
		media: true,
		hashtag: true,
		notification: true,
		translation: false,
		appearance: "system",
	});

	const changeTheme = async (theme: "light" | "dark" | "auto") => {
		await invoke("plugin:theme|set_theme", { theme });
		// update state
		setSettings((prev) => ({ ...prev, appearance: theme }));
	};

	const toggleLowPower = async () => {
		await storage.createSetting("lowPower", String(+!settings.lowPower));
		setSettings((state) => ({ ...state, lowPower: !settings.lowPower }));
	};

	const toggleAutolaunch = async () => {
		if (!settings.autolaunch) {
			await enable();
			// update state
			setSettings((prev) => ({ ...prev, autolaunch: true }));
		} else {
			await disable();
			// update state
			setSettings((prev) => ({ ...prev, autolaunch: false }));
		}
	};

	const toggleMedia = async () => {
		await storage.createSetting("media", String(+!settings.media));
		storage.settings.media = !settings.media;
		// update state
		setSettings((prev) => ({ ...prev, media: !settings.media }));
	};

	const toggleHashtag = async () => {
		await storage.createSetting("hashtag", String(+!settings.hashtag));
		storage.settings.hashtag = !settings.hashtag;
		// update state
		setSettings((prev) => ({ ...prev, hashtag: !settings.hashtag }));
	};

	const toggleAutoupdate = async () => {
		await storage.createSetting("autoupdate", String(+!settings.autoupdate));
		storage.settings.autoupdate = !settings.autoupdate;
		// update state
		setSettings((prev) => ({ ...prev, autoupdate: !settings.autoupdate }));
	};

	const toggleNofitication = async () => {
		if (settings.notification) return;

		await requestPermission();
		// update state
		setSettings((prev) => ({ ...prev, notification: !settings.notification }));
	};

	const toggleTranslation = async () => {
		await storage.createSetting("translation", String(+!settings.translation));
		storage.settings.translation = !settings.translation;
		// update state
		setSettings((prev) => ({ ...prev, translation: !settings.translation }));
	};

	const saveApi = async () => {
		await storage.createSetting("translateApiKey", apiKey);
	};

	useEffect(() => {
		async function loadSettings() {
			const theme = await getCurrent().theme();
			setSettings((prev) => ({ ...prev, appearance: theme }));

			const autostart = await isEnabled();
			setSettings((prev) => ({ ...prev, autolaunch: autostart }));

			const permissionGranted = await isPermissionGranted();
			setSettings((prev) => ({ ...prev, notification: permissionGranted }));

			const data = await storage.getAllSettings();
			if (!data) return;

			for (const item of data) {
				if (item.key === "autoupdate")
					setSettings((prev) => ({
						...prev,
						autoupdate: !!parseInt(item.value),
					}));

				if (item.key === "lowPower")
					setSettings((prev) => ({
						...prev,
						lowPower: !!parseInt(item.value),
					}));

				if (item.key === "outbox")
					setSettings((prev) => ({
						...prev,
						outbox: !!parseInt(item.value),
					}));

				if (item.key === "media")
					setSettings((prev) => ({
						...prev,
						media: !!parseInt(item.value),
					}));

				if (item.key === "hashtag")
					setSettings((prev) => ({
						...prev,
						hashtag: !!parseInt(item.value),
					}));

				if (item.key === "translation")
					setSettings((prev) => ({
						...prev,
						translation: !!parseInt(item.value),
					}));
			}
		}

		loadSettings();
	}, []);

	return (
		<div className="mx-auto w-full max-w-lg">
			<div className="flex flex-col gap-6">
				<div className="flex w-full items-center justify-between">
					<div className="flex items-center gap-8">
						<div className="w-24 shrink-0 text-end text-sm font-semibold">
							Update
						</div>
						<div className="text-sm">Automatically download new update</div>
					</div>
					<Switch.Root
						checked={settings.autoupdate}
						onClick={() => toggleAutoupdate()}
						className="relative h-7 w-12 cursor-default rounded-full bg-neutral-200 outline-none data-[state=checked]:bg-blue-500 dark:bg-neutral-800"
					>
						<Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[19px]" />
					</Switch.Root>
				</div>
				<div className="flex w-full items-center justify-between">
					<div className="flex items-center gap-8">
						<div className="w-24 shrink-0 text-end text-sm font-semibold">
							Low Power
						</div>
						<div className="text-sm">
							Sustainable for low network environment.
						</div>
					</div>
					<Switch.Root
						checked={settings.lowPower}
						onClick={() => toggleLowPower()}
						className="relative h-7 w-12 cursor-default rounded-full bg-neutral-200 outline-none data-[state=checked]:bg-blue-500 dark:bg-neutral-800"
					>
						<Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[19px]" />
					</Switch.Root>
				</div>
				<div className="flex w-full items-center justify-between">
					<div className="flex items-center gap-8">
						<div className="w-24 shrink-0 text-end text-sm font-semibold">
							Startup
						</div>
						<div className="text-sm">Launch Lume at Login</div>
					</div>
					<Switch.Root
						checked={settings.autolaunch}
						onClick={() => toggleAutolaunch()}
						className="relative h-7 w-12 cursor-default rounded-full bg-neutral-200 outline-none data-[state=checked]:bg-blue-500 dark:bg-neutral-800"
					>
						<Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[19px]" />
					</Switch.Root>
				</div>
				<div className="flex w-full items-center justify-between">
					<div className="flex items-center gap-8">
						<div className="w-24 shrink-0 text-end text-sm font-semibold">
							Media
						</div>
						<div className="text-sm">Automatically load media</div>
					</div>
					<Switch.Root
						checked={settings.media}
						onClick={() => toggleMedia()}
						className="relative h-7 w-12 cursor-default rounded-full bg-neutral-200 outline-none data-[state=checked]:bg-blue-500 dark:bg-neutral-800"
					>
						<Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[19px]" />
					</Switch.Root>
				</div>
				<div className="flex w-full items-center justify-between">
					<div className="flex items-center gap-8">
						<div className="w-24 shrink-0 text-end text-sm font-semibold">
							Hashtag
						</div>
						<div className="text-sm">Show all hashtags in content</div>
					</div>
					<Switch.Root
						checked={settings.hashtag}
						onClick={() => toggleHashtag()}
						className="relative h-7 w-12 cursor-default rounded-full bg-neutral-200 outline-none data-[state=checked]:bg-blue-500 dark:bg-neutral-800"
					>
						<Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[19px]" />
					</Switch.Root>
				</div>
				<div className="flex w-full items-center justify-between">
					<div className="flex items-center gap-8">
						<div className="w-24 shrink-0 text-end text-sm font-semibold">
							Notification
						</div>
						<div className="text-sm">Automatically send notification</div>
					</div>
					<Switch.Root
						checked={settings.notification}
						disabled={settings.notification}
						onClick={() => toggleNofitication()}
						className="relative h-7 w-12 cursor-default rounded-full bg-neutral-200 outline-none data-[state=checked]:bg-blue-500 dark:bg-neutral-800"
					>
						<Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[19px]" />
					</Switch.Root>
				</div>
				<div className="flex w-full items-center justify-between">
					<div className="flex items-center gap-8">
						<div className="w-24 shrink-0 text-end text-sm font-semibold">
							Translation
						</div>
						<div className="text-sm">Translate text to your language</div>
					</div>
					<Switch.Root
						checked={settings.translation}
						onClick={() => toggleTranslation()}
						className="relative h-7 w-12 cursor-default rounded-full bg-neutral-200 outline-none data-[state=checked]:bg-blue-500 dark:bg-neutral-800"
					>
						<Switch.Thumb className="block h-6 w-6 translate-x-0.5 rounded-full bg-white transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[19px]" />
					</Switch.Root>
				</div>
				{settings.translation ? (
					<div className="flex w-full items-center gap-8">
						<div className="w-24 shrink-0 text-end text-sm font-semibold">
							API Key
						</div>
						<div className="relative w-full">
							<input
								type="password"
								spellCheck={false}
								value={apiKey}
								onChange={(e) => setAPIKey(e.target.value)}
								className="w-full border-transparent outline-none focus:outline-none focus:ring-0 focus:border-none h-9 rounded-lg ring-0 placeholder:text-neutral-600 bg-neutral-100 dark:bg-neutral-900"
							/>
							<div className="h-9 absolute right-0 top-0 inline-flex items-center justify-center">
								<button
									type="button"
									onClick={saveApi}
									className="mr-1 h-7 w-16 text-sm font-medium shrink-0 inline-flex items-center justify-center rounded-md bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700"
								>
									Save
								</button>
							</div>
						</div>
					</div>
				) : null}
				<div className="flex w-full items-start gap-8">
					<div className="w-24 shrink-0 text-end text-sm font-semibold">
						Appearance
					</div>
					<div className="flex flex-1 gap-6">
						<button
							type="button"
							onClick={() => changeTheme("light")}
							className="flex flex-col items-center justify-center gap-0.5"
						>
							<div
								className={cn(
									"inline-flex h-11 w-11 items-center justify-center rounded-lg",
									settings.appearance === "light"
										? "bg-blue-500 text-white"
										: "bg-neutral-100 dark:bg-neutral-900",
								)}
							>
								<LightIcon className="h-5 w-5" />
							</div>
							<p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
								Light
							</p>
						</button>
						<button
							type="button"
							onClick={() => changeTheme("dark")}
							className="flex flex-col items-center justify-center gap-0.5"
						>
							<div
								className={cn(
									"inline-flex h-11 w-11 items-center justify-center rounded-lg",
									settings.appearance === "dark"
										? "bg-blue-500 text-white"
										: "bg-neutral-100 dark:bg-neutral-900",
								)}
							>
								<DarkIcon className="h-5 w-5" />
							</div>
							<p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
								Dark
							</p>
						</button>
						<button
							type="button"
							onClick={() => changeTheme("auto")}
							className="flex flex-col items-center justify-center gap-0.5"
						>
							<div
								className={cn(
									"inline-flex h-11 w-11 items-center justify-center rounded-lg",
									settings.appearance === "auto"
										? "bg-blue-500 text-white"
										: "bg-neutral-100 dark:bg-neutral-900",
								)}
							>
								<SystemModeIcon className="h-5 w-5" />
							</div>
							<p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
								System
							</p>
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
