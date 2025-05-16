import type { AgentRequest, AgentResponse, AgentContext } from "@agentuity/sdk";
import { Octokit } from "octokit";
import { generateText, tool } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

const createGitHubIssueTool = tool({
	description: "Create a GitHub issue in a specified repository",
	parameters: z.object({
		repository: z
			.string()
			.describe("The GitHub repository in format owner/repo"),
		title: z.string().describe("The title for the GitHub issue"),
		body: z.string().describe("The markdown body content for the GitHub issue"),
	}),
	execute: async ({ repository, title, body }) => {
		const githubToken = process.env.GITHUB_TOKEN;
		if (!githubToken) {
			throw new Error(
				"GitHub token is not configured. Please set the GITHUB_TOKEN environment variable."
			);
		}

		try {
			const octokit = new Octokit({ auth: githubToken });
			const [owner, repo] = repository.split("/");

			if (!owner || !repo) {
				throw new Error(
					"Invalid repository format. Please use the format: owner/repo"
				);
			}

			const response = await octokit.rest.issues.create({
				owner,
				repo,
				title,
				body,
			});

			return {
				success: true,
				url: response.data.html_url,
				message: `Issue created successfully in ${repository}!`,
			};
		} catch (error) {
			console.error("Error creating issue:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				message: `Failed to create issue: ${
					error instanceof Error ? error.message : String(error)
				}`,
			};
		}
	},
});

export default async function Agent(
	req: AgentRequest,
	resp: AgentResponse,
	ctx: AgentContext
) {
	const requestText = await req.data.text();
	if (!requestText) {
		return resp.text(
			"Please provide details about the issue you want to create."
		);
	}

	try {
		const result = await generateText({
			model: google("gemini-2.0-flash"),
			system: `You are an AI assistant that helps users create GitHub issues.
			Your primary function is to extract relevant information from the user's request and use it to populate the fields for creating a GitHub issue using the \`createGitHubIssue\` tool,
			the user might provide the relvant data in many formats some explicit and other implicit, like links, extract the data from that but dont guess anything.
			If critical information such as the target repository or a clear title for the issue is missing from the user's request, 
			you must inform the user, explaining what specific pieces of information are needed to proceed. 
			Based on the user's request, generate a detailed and well-formatted markdown description for the GitHub issue. 
			This description should accurately reflect the user's intent.`,
			prompt: requestText,
			tools: {
				createGitHubIssue: createGitHubIssueTool,
			},
			maxSteps: 2,
		});

		if (result.toolCalls.length === 0) {
			return resp.text(result.text);
		}

		const lastToolCall = result.toolResults[result.toolResults.length - 1];
		const issueResult = lastToolCall?.result as {
			success: boolean;
			url?: string;
			message: string;
			error?: string;
		};

		if (issueResult.success && issueResult.url) {
			return resp.text(`${issueResult.message} View it at: ${issueResult.url}`);
		} else {
			return resp.text(issueResult.message);
		}
	} catch (error) {
		console.error("Error in GitHub issue agent:", error);
		return resp.text(
			`An error occurred while processing your request: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}
}

export function welcome() {
	return {
		welcome:
			"Hey there!, I'm your GitHub issue assistant. I can help you create GitHub issues, spesify the repository and title, and even provide a detailed description for the issue. Just let me know what you need help with, and I'll do my best to assist you.",
		prompts: [
			{
				data: "Create an issue at https://github.com/yoav0gal/github-interview-request-agent and explain how mazing this agent is, call it a show of appreciation, add some emoji's and fun stuff to the issue ",
				contentType: "text/plain",
			},
		],
	};
}
