export {};

declare global {
	const DISCORD_CLIENT_ID: string;
	const DISCORD_CLIENT_SECRET: string;
	const DISCORD_PUBLIC_KEY: string;

	const followers: KVNamespace;
	const webhooks: KVNamespace;
}
