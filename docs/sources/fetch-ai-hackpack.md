# Fetch.ai hackpack: ASI:One Agent Challenge

> **Source:** https://www.fetch.ai/events/hackathons/calhacks-13-0/hackpack (linked from https://www.fetch.ai/events/calhacks-13-0)  
> **Captured:** 2026-10-24  
> **Summary:** Full Fetch.ai track rules. Key constraint: the primary user workflow must run inside an ASI:One conversation with **no custom frontend**.

## Problem statement

Build an AI agent that users can discover through ASI:One, understand their intent, and take meaningful action on a real-world problem. The result should go beyond a chatbot or thin API wrapper. It can be a single agent or a multi-agent system that plans, reasons, and orchestrates multi-step tasks using tools, APIs, data sources, MCP, or other agents.

## Prizes

The event page lists different amounts from the Hacker Guide ($1,500 / $1,000 / $500):

- 1st: $1,250 cash + internship interview opportunity
- 2nd: $750 cash + internship interview opportunity
- 3rd: $500 cash + internship interview opportunity
- Special Recognition (x2): $250 cash each
- Offer: one month free ASI:One Pro + Agentverse Premium (code on the event page)

Judges: Sana Wajid (Chief Development & Operations Officer), Rajashekar Vennavelli (Senior AI Engineer).

## Judging criteria

1. **Functionality & Technical Implementation (25%)**: does the system work as intended, with agents communicating and reasoning in real time?
2. **Use of Fetch.ai Technology (20%)**: agents registered on Agentverse, Chat Protocol implemented for ASI:One discoverability, Payment Protocol integrated for monetization.
3. **Innovation & Creativity (20%)**
4. **Real-World Impact & Usefulness (20%)**
5. **User Experience & Presentation (15%)**

## Technical requirements

**Mandatory**
- Register at least one agent on Agentverse.
- Implement the Agent Chat Protocol (ACP).
- Make the project discoverable and directly usable through ASI:One.
- Demonstrate meaningful tool execution or multi-agent orchestration.
- Complete the primary user workflow entirely within an ASI:One conversation, with no custom frontend.
- Public GitHub repository with run/test instructions.

**Recommended:** ASI1 Interactive Cards for forms, carousels, review screens, detail views.

**Bonus:** multi-agent collaboration; Payment Protocol with a credible monetization model; effective Interactive Cards; strong error handling and recovery; creative use of real-time data; a design that could keep running after the hackathon.

**Frameworks:** any (Google ADK, LangGraph, CrewAI, OpenAI Agents SDK, Claude Agent SDK, uAgents, plain Python).

## Submission requirements

1. **Code:** public GitHub repo; README listing each agent's name and address; extra resources needed to run, with links; these badges in the README:
   - `![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)`
   - `![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)`
2. **Video:** 3–5 minute demo showing the agents.
3. **Platform:** submit on Devpost **and** register through the CalHacks ASI:One Submission Agent.

## Links

- ASI:One: https://asi1.ai/ · Agentverse: https://agentverse.ai/
- Submission agent: https://asi1.ai/auth/signup?returnTo=%2Ffestival%2Fcalhacks2026%2Fdashboard%3Futm_source%3Dcalhacks2026
- Submission process video: https://drive.google.com/file/d/1EDfKrM7l8soO-40eKkPYDAEkRUTwQKyf
- Full information doc: https://docs.google.com/document/d/1UDW-X1C24hxZviFOQzjTeh0pXRNAoflMb8lhJqZP9Z0
- ASI:One Pro offer: https://drive.google.com/file/d/17iBT9I2xnllnYerECd53nnhAfOxS-WdD/view
- Agentverse Premium offer: https://drive.google.com/file/d/1adhDjri7DvzGwEcZNlVlHj7rweMdv_0u/view
- Examples: https://github.com/fetchai/innovation-lab-examples · Past projects: https://innovationlab.fetch.ai/projects
- Create a uAgent: https://innovationlab.fetch.ai/resources/docs/agent-creation/uagent-creation
- Mailbox (local agent → Agentverse): https://innovationlab.fetch.ai/resources/docs/agent-creation/uagent-creation#mailbox-agents
- uAgent-to-uAgent communication: https://innovationlab.fetch.ai/resources/docs/agent-communication/uagent-uagent-communication
- ASI-compatible uAgents (chat protocol): https://innovationlab.fetch.ai/resources/docs/examples/chat-protocol/asi-compatible-uagents
- ASI:One API quickstart: https://innovationlab.fetch.ai/resources/docs/asione/asi-one-quickstart
- Interactive Cards: https://innovationlab.fetch.ai/resources/docs/interactive-cards/asi-interactive-cards
- Agentverse MCP: https://docs.agentverse.ai/documentation/advanced-usages/agentverse-mcp (full: https://mcp.agentverse.ai/sse, lite: https://mcp-lite.agentverse.ai/mcp)
