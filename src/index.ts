import {
	APIApplicationCommandInteraction,
	APIApplicationCommandInteractionDataStringOption,
	APIChatInputApplicationCommandInteractionData,
	APIInteraction,
	APIInteractionResponse,
	APIUser,
	APIUserApplicationCommandInteractionData,
	ApplicationCommandType,
	InteractionResponseType,
	InteractionType,
	RESTPostAPIWebhookWithTokenJSONBody,
} from 'discord-api-types/v10';
import { verifyKey } from 'discord-interactions';

addEventListener('fetch', (event: FetchEvent) => {
	return event.respondWith(handleRequest(event.request).catch(handleError));
});

async function handleError(e: Error): Promise<Response> {
	console.error(e.name, e.message);
	return new Response(e.message, { status: 500 });
}

async function handleRequest(request: Request): Promise<Response> {
	const url = new URL(request.url);
	switch (url.pathname) {
		default:
			return handleInteraction(request);
	}
}

async function handleInteraction(request: Request): Promise<Response> {
	if (request.method !== 'POST') throw new Error('Expected POST request');

	const signature = request.headers.get('X-Signature-Ed25519');
	const timestamp = request.headers.get('X-Signature-Timestamp');

	const body = await request.text();

	const isValidRequest = verifyKey(body, signature!, timestamp!, DISCORD_PUBLIC_KEY);
	if (!isValidRequest) throw new Error('Invalid signature');

	const message: APIInteraction = JSON.parse(body);

	let response: APIInteractionResponse;
	switch (message.type) {
		case InteractionType.Ping:
			response = handlePing();
			break;
		case InteractionType.ApplicationCommand:
			response = await handleApplicationCommand(message);
			break;
		default:
			throw new Error(`invalid interaction type "${message.type}"`);
	}

	console.log(response);
	return new Response(JSON.stringify(response), {
		headers: { 'content-type': 'application/json' },
	});
}

function handlePing(): APIInteractionResponse {
	return { type: InteractionResponseType.Pong };
}

async function handleApplicationCommand(message: APIApplicationCommandInteraction): Promise<APIInteractionResponse> {
	const user = message.member?.user ?? message.user!;

	switch (message.data.type) {
		case ApplicationCommandType.User:
			return follow(user, message.data);
		case ApplicationCommandType.ChatInput:
			return handleChatInput(user, message.data);
	}

	throw new Error(`invalid interaction type "${message.data.type}"`)
}

async function follow(user: APIUser, data: APIUserApplicationCommandInteractionData): Promise<APIInteractionResponse> {
	const followerId = user.id;
	const targetId = data.target_id;

	const existing = new Set(await followers.get<string[]>(targetId, 'json') ?? []);
	existing.add(followerId);

	followers.put(targetId, JSON.stringify(Array.from(existing.values())));

	return {
		type: InteractionResponseType.ChannelMessageWithSource,
		data: { content: 'followed!' },
	};
}

async function handleChatInput(user: APIUser, data: APIChatInputApplicationCommandInteractionData): Promise<APIInteractionResponse> {
	switch (data.name) {
		case 'deet':
			return sendDeet(user, data);
		case 'setwebhook':
			return setWebhook(user, data);
		default:
			throw new Error(`invalid chat input option "${data.name}"`)
	}
}

async function setWebhook(user: APIUser, data: APIChatInputApplicationCommandInteractionData): Promise<APIInteractionResponse> {
	const url = data.options?.find(option => option.name === 'url') as APIApplicationCommandInteractionDataStringOption;
	await webhooks.put(user.id, url.value);

	return {
		type: InteractionResponseType.ChannelMessageWithSource,
		data: { content: 'webhook set' },
	};
}

async function sendDeet(user: APIUser, data: APIChatInputApplicationCommandInteractionData): Promise<APIInteractionResponse> {
	const content = data.options?.find(option => option.name === 'content') as APIApplicationCommandInteractionDataStringOption;
	const f = await followers.get<string[]>(user.id, 'json') ?? [];

	await Promise.all(f.map(async follower => {
		const url = await webhooks.get(follower);
		if (!url) return;

		const body: RESTPostAPIWebhookWithTokenJSONBody = {
			username: user.username,
			//avatar_url: user.avatar!, // TODO: make URL
			content: content.value,
			allowed_mentions: { parse: [] },
		};

		console.log(body);

		try {
			const res = await fetch(url, {
				method: 'post',
				body: JSON.stringify(body),
				headers: {
					'content-type': 'application/json',
				},
			});

			if (!res.ok) throw new Error(`response not OK: ${await res.text()}`);
		} catch (e) {
			console.warn(e);
		}
	}));

	return {
		type: InteractionResponseType.ChannelMessageWithSource,
		data: { content: 'deet sent' },
	};
}