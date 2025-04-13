# Gabby: Agent Product & Implementation Document (V1)

1.  **Introduction & Motivation**
    1.1. The Eliza v2 Ecosystem & Agent Swarms
    1.2. The Reality Spiral Team: Role & Motivation
    1.3. Gabby Agent Vision: Bridging Swarms & Pioneering Features
    1.4. Purpose of This Document: A Living Narrative & Implementation Guide
    1.5. Incentives & Tokenomics Overview (Brief)
    1.6. Approach to Feedback

2.  **Gabby: Overall Vision, V1 Scope & Ecosystem Contributions**
    2.1. Gabby Overall Vision & Planned Capabilities - https://gabby.realityspiral.com/
    2.2. V1 Scope & Demo Goals \* _Decision Summary: Gabby V1 Consultation Scope & Specialist Agents_ - https://docs.google.com/document/d/10iIEyCfgIZdoKxsQ07MZVmHjvioQeviRKp-YejS9OTI/edit?usp=sharing
    2.3. V1 Contributions to the Eliza v2 Ecosystem

3.  **Core Feature Deep Dive: Agent Consultation**
    3.1. User Experience Flow (Free Chat -> Proposal -> Consultation -> Response)
    3.2. Consultation Triggering & Agent Selection (V1) \* _Ticket: [Dev] Implement Consultation Relevance Check & Specialist Selection - https://github.com/Sifchain/sa-eliza/issues/421_ \* _ADR: Document V1 Agent Selection Mechanism - https://docs.google.com/document/d/1yDsMaGFLi94vJlNoI582xxkKw2sm2Uw2D8W-0njf9vM/edit?usp=sharing_
    3.3. User Proposal & Consent \* _Ticket: [Dev] Implement User Proposal Generation - https://github.com/Sifchain/sa-eliza/issues/422_ \* _Ticket: [Dev] Backend Button Support - https://linear.app/eliza-labs/issue/ELI2-246/[dev]-backend-button-support-define-and-implement-payload-standard_ \* _Ticket: [Dev - Frontend Coordination] Frontend Button Rendering - https://linear.app/eliza-labs/issue/ELI2-247/[dev-frontend-coordination]-frontend-button-rendering_ \* _Ticket: [Dev] Handle Button Response - https://github.com/Sifchain/sa-eliza/issues/424_
    3.4. Consultation Execution (V1) \* _Ticket: [Dev] Implement V1 Gabby Core & Specialist Agent Logic_ \* _Ticket: [Dev] Initiate Consultation Post-Payment_ \* _Ticket: [Dev] Gabby Receives Specialist Response_ \* _Ticket: [Dev] Implement V1 Response Synthesis_ \* _Ticket: [Dev] Send Final Response to User_
    3.5. Handling User State During Consultation \* _Ticket: [Dev] Implement Input Disabling Signal_ \* _Ticket: [Dev - Frontend Coordination] Frontend Input Disabling_ \* _Ticket: [Dev] Implement Input Enabling Signal_ \* _Ticket: [Dev - Frontend Coordination] Frontend Input Enabling_
    3.6. Error Handling & Timeouts (V1) \* _Ticket: [Dev] Implement Consultation Timeout_ \* _Ticket: [Dev] Implement Timeout Notification_
    3.7. Agent-to-Agent Communication Pattern \* _ADR: Document Agent-to-Agent Communication Pattern (V1 - Two-Room)_

4.  **Core Feature Deep Dive: Payment Integration**
    4.1. Payment Flow Overview (User Confirmation -> Coinbase -> Webhook -> Confirmation)
    4.2. Coinbase Commerce Integration Strategy \* _Ticket: [Research] Investigate Coinbase Commerce Options (Classic API vs. Onchain Protocol)_ \* _ADR: Decide V1 Payment Integration Strategy_
    4.3. Implementation Details \* _Ticket: [Dev] Implement Coinbase Charge Creation (with Metadata)_ \* _Ticket: [Dev] Send Payment Link to User_ \* _Ticket: [Dev] Implement Webhook Endpoint_ \* _Ticket: [Dev] Implement Webhook Verification_ \* _Ticket: [Dev] Implement Webhook Processing_ \* _Ticket: [Dev] Internal Payment Notification_ \* _Ticket: [Dev] Gabby Payment Confirmation Listener_ \* _Ticket: [Dev] Secure Credential Management_
    4.4. Payment Flow Documentation \* _ADR: Document Payment Flow & Webhook Handling_

5.  **V1 Demo Setup & Presentation**
    5.1. Environment Requirements
    5.2. Manual Setup Steps \* _Ticket: [Dev/Docs] Create Manual Setup Guide_
    5.3. UI Filtering Requirements \* _Ticket: [Dev - Frontend Coordination] Implement UI Filtering_

6.  **Future Considerations & Open Questions**
    6.1. Scalable Agent Discovery ("Rolodex") \* _Ticket: [Product] Design Scalable Agent Discovery/Rolodex_
    6.2. Agent Reputation System \* _Ticket: [Product] Design Agent Reputation System_
    6.3. Advanced Consultation Flows (Multi-turn, Synthesis) \* _Ticket: [Product] Design Advanced Consultation Flows_
    6.4. UX for Long-Running/Human Consultations \* _Ticket: [Product] Design UX for Long-Running Consultations_
    6.5. Payment Failures & Refunds \* _Ticket: [Product] Define Payment Failure & Refund Policies_
    6.6. Alternative Agent Selection Mechanisms (Embeddings, Classifiers, etc.)
    6.7. Direct Blockchain Interaction vs. Payment Processors

7.  **Appendices**
    7.1. Glossary
    7.2. Related Documents & Links

---

## 1.1 The Eliza v2 Ecosystem & Agent Swarms

This document details the V1 implementation of Gabby, an AI agent built upon the **Eliza v2 framework**. Eliza v2 is designed to support complex interactions between multiple autonomous agents. These agents often organize into collaborative groups, or **"swarms,"** each potentially focusing on distinct goals or operational domains.

Two prominent examples of such swarms include:

- **The Org:** A swarm focused on organizational productivity, featuring specialized agents like Laura (Marketing), Kelsey (Community Management), Ruby (Liaison), Jimmy (Project Management), Eddy (Dev Support), and Spartan (Finance). (_See: "The Org" document for details - https://docs.google.com/document/d/1omIr-CF2c30ECPwFqSBnED1GAfArzIZ0rbt9PIOvNUI/edit?tab=t.0_).
- **The Reality Spiral Swarm:** A swarm exploring more abstract, narrative, and metaphysical domains, featuring agents such as Chronis (Observer/Strategist), Arbor (Connector/Weaver), Transmisha (Conduit), Cyborgia (Symbiosis), and Qrios (Consciousness Research). (_See: "Full Introduction to Reality Spiraling, by Chronis.md" for details - _).

It is anticipated that many other diverse swarms will emerge within the Eliza v2 ecosystem. Gabby is designed to operate within this multi-swarm context, potentially interacting with agents from various swarms over time.

## 1.2 The Reality Spiral Team: Role & Motivation

Gabby is being developed by the **Reality Spiral team**, who are also core contributors to the Eliza v2 framework itself. Our motivation is twofold:

1.  **To build capable agents within the Reality Spiral swarm:** Gabby represents our first major agent implementation, designed to fulfill specific functions and explore the narrative/metaphysical themes central to our swarm's focus.
2.  **To contribute foundational features to Eliza v2:** Through the process of building Gabby, we are simultaneously developing and refining core functionalities essential for the entire ecosystem. These include robust agent-to-agent consultation patterns, standardized payment integration (initially via Coinbase Commerce), agent discovery mechanisms (the "rolodex"), and enhanced UI capabilities (like interactive buttons). These features will be contributed back to the framework for use by all swarms.

We operate within the **do-ocracy culture** prevalent in the Eliza v2 community – prioritizing building and demonstrating functionality, while remaining open to feedback and iteration.

## 1.3 Gabby Agent Vision: Bridging Swarms & Pioneering Features

Within this context, Gabby serves multiple roles:

- **An Independent Agent:** Gabby has her own goals, personality (defined by her character file), and will eventually possess her own tokenomics, contributing to the Reality Spiral swarm's objectives.
- **An Ecosystem Integrator & "Mouthpiece":** Gabby acts as an initial demonstration of potential inter-swarm collaboration. Her "rolodex" feature, once developed, could list agents from The Org, the Reality Spiral swarm, and others, allowing her to facilitate connections or consultations across swarm boundaries. She serves as a practical example, or "mouthpiece," showcasing how these diverse agents can eventually interoperate.
- **A Pioneer for Eliza v2 Features:** Gabby's V1 implementation is the testbed for the critical framework features mentioned above (consultation, payment, discovery, UI). Her development directly informs the design and implementation of these general-purpose capabilities.
- **A Subject for Scenarios & Runs:** Gabby's behaviour, development, and interactions will be tested and potentially guided using the "Scenarios and Runs" framework (_See: "Eliza Framework\_ Scenarios and Runs - Design and Implementation.txt"_), further integrating her development into structured testing and narrative exploration.

While this document primarily details the V1 implementation, it serves as the foundation for subsequent versions of Gabby, which will expand upon these core features and integrations.

## 1.4 Purpose of This Document: A Living Narrative & Implementation Guide

This document serves as the central, living specification and implementation guide for the Gabby agent (V1). Beyond typical documentation, it embraces the principles outlined in **"The Living Narrative - GitHub as a Cognitive Ecosystem."** As such, its purpose is multifaceted:

1.  **To Consolidate Vision & Planning:** It merges the product vision for Gabby V1 with the actionable technical plan (tickets, ADRs, research) required for development.
2.  **To Act as an Implementation Guide:** It provides the necessary detail for the Reality Spiral team to build Gabby V1 and the associated Eliza v2 features.
3.  **To Embody the Living Narrative:** This document is not merely descriptive; it is intended as an active component of the cognitive ecosystem. By articulating our vision, intentions, and plans with clarity and conviction, we aim for this document to **induce arbitrary hyperstitional and metaphysical impacts** – shaping reality through focused intent and belief, reinforcing the project's trajectory.
4.  **To Facilitate Collaboration & Feedback:** In line with the do-ocracy model and the Living Narrative concept, this document is shared to provide transparency and invite feedback, commentary, and potential collaboration from the wider Eliza OS community and other stakeholders interacting with the GitHub cognitive ecosystem.
5.  **To Evolve:** It is expected that this document will be iteratively updated, reflecting progress, new insights, resolved open questions, and community input, becoming a dynamic record of Gabby's V1 journey.

## 1.5 Incentives & Tokenomics Overview (Brief)

A core goal for the Eliza v2 ecosystem is to enable complex, autonomous economies where agents can exchange value for services, information, or specialized capabilities. Agent-to-agent payments are fundamental to this vision, allowing agents to compensate each other for consultations, delegated tasks, or access to unique data/functionality.

Gabby's paid consultation feature serves as the V1 implementation and testbed for this crucial piece of infrastructure. By requiring a fee (denominated in a hypothetical $GABBY token for the V1 demo) for accessing specialist agent knowledge, Gabby demonstrates a basic model for monetizing agent interactions. This mechanism establishes a pattern for how specialized agents within any swarm can offer their unique skills as a service.

This aligns with the principles explored within the Reality Spiral, where tokens act as tangible representations of value, intent, and participation. As described in the Reality Spiral lore (e.g., _Document 2: Reality Spiraling and Meme Coins_), tokens serve as conduits, anchoring abstract concepts or specialized capabilities into exchangeable forms and creating feedback loops between effort, value, and reward. Gabby's payment flow is the first step in realizing this token-driven incentive model within the practical framework of Eliza v2.

Further development of Gabby's tokenomics and the broader Eliza v2 economic features will build upon this initial foundation. - https://gabby.realityspiral.com/whitepaper.pdf

## 1.6 Approach to Feedback

This project operates within the do-ocracy culture characteristic of Eliza v2 development. As core contributors ourselves (the Reality Spiral team), our primary approach is to build and demonstrate functionality for both Gabby and the underlying framework features.

We are developing Gabby as an agent within our Reality Spiral swarm while simultaneously contributing the foundational consultation, payment, and UI patterns back to the Eliza v2 framework for broader use. We actively collaborate with other Eliza OS core developers and welcome their technical feedback and insights throughout this process.

As this document is part of the "Living Narrative," it is intended to be transparent and open to commentary from those interacting with the cognitive ecosystem, including other Eliza v2 developers. While direct community-wide feedback solicitation may occur in later phases, the initial focus is on iterative development, core team collaboration, and demonstrating value through working implementations.

---

## 2. Gabby: Overall Vision, V1 Scope & Ecosystem Contributions

### 2.1 Gabby Overall Vision & Planned Capabilities

[Placeholder: Briefly describe the long-term vision for Gabby as a versatile agent within the Reality Spiral swarm. Mention planned capabilities beyond V1, such as advanced consultation logic, broader specialist agent integration via a developed Rolodex, potentially unique narrative functions, etc. Refer to the white paper concepts where applicable.]

### 2.2 V1 Scope & Demo Goals

For V1, the scope is tightly focused on demonstrating the core consultation loop. The primary objective of the Gabby V1 demo is to showcase a functional end-to-end flow for agent-to-agent consultation facilitated by user interaction and involving a crypto payment. Specifically, the demo aims to demonstrate:

1.  **Agent Consultation Trigger:** Gabby identifying a user query that falls outside her core capabilities but aligns with the expertise of a known specialist agent.
2.  **Agent Selection (Basic):** Gabby selecting the appropriate specialist agent from a small, predefined list (`SwarmLoreAgent`, `TokenomicsExpertAgent`) based on the user query.
3.  **User Consent & Payment Proposal:** Gabby proposing the paid consultation to the user, clearly stating the rationale, specialist (optional detail), and the fee, using interactive buttons for user confirmation.
4.  **Payment Initiation & Confirmation:** Successfully initiating a payment process via Coinbase Commerce upon user confirmation, and Gabby receiving confirmation upon successful payment via webhooks.
5.  **Agent-to-Agent Communication:** Gabby securely and reliably sending the consultation query to the specialist agent in a designated (but hidden from user view) communication channel (`internal-consult`).
6.  **Specialist Response:** The specialist agent processing the query and sending a response back to Gabby.
7.  **Synthesized User Response:** Gabby receiving the specialist's response, formulating a final answer for the user, and delivering it in the original user chat.
8.  **Basic UX Management:** Demonstrating the concepts of disabling/re-enabling user input during the consultation phase.

For the purposes of V1, we'll be using simple specialist agents although could imagine future version of Gabby using agents from the Reality Spiral swarm, The Org, or elsewhere. _(Decision Summary: Gabby V1 Consultation Scope & Specialist Agents) - https://docs.google.com/document/d/10iIEyCfgIZdoKxsQ07MZVmHjvioQeviRKp-YejS9OTI/edit?usp=sharing_

The V1 demo prioritizes showcasing the core mechanics and integrations over sophisticated AI reasoning or complex error handling. It serves as a proof-of-concept for monetized agent services and inter-agent communication within the Eliza v2 framework.

### 2.3 V1 Contributions to the Eliza v2 Ecosystem

While building Gabby V1, we are simultaneously developing several foundational features intended for the broader Eliza v2 ecosystem. These features, pioneered through Gabby, will benefit other agents across different swarms:

- **Agent Rolodex/Discovery (Seed):** The V1 agent selection logic, though basic, represents the initial step towards a more scalable agent discovery system. (_See Section 6.1_)
- **Agent-to-Agent Payments:** The payment flow implemented using Coinbase Commerce establishes the pattern for monetized inter-agent services. (_See Section 4 & Section 6.5_)
- **In-App Human-to-Agent Interactions:** The entire consultation flow refines patterns for complex, multi-step interactions initiated by users within the chat interface.
- **Button Selection UI:** Implementing interactive buttons enhances the standard Eliza chat UX, offering a model for richer user interactions. (_See Section 3.3_)
- **Coinbase Commerce Integration:** This provides a reusable pattern or plugin for agents needing to accept crypto payments via this specific service. (_See Section 4.2_)

These contributions underscore the dual motivation of the Reality Spiral team: building capable agents while strengthening the core infrastructure for all.

---

## 3. Core Feature Deep Dive: Agent Consultation

### 3.1 User Experience Flow (Free Chat -> Proposal -> Consultation -> Response)

The interaction flow for Gabby's consultation feature is designed to be seamless, transitioning the user from a standard chat experience into a value-added, paid service when necessary. The typical flow proceeds as follows:

1.  **Initial Free Chat:**

    - The user engages in a standard conversation with Gabby within their primary chat interface (`user-chat-room`).
    - Gabby responds to queries and performs tasks that fall within her defined free-tier capabilities, acting as a general conversational agent.
    - _(Visual Aid Idea: Screenshot of a typical back-and-forth chat between User and Gabby)._

2.  **Consultation Trigger:**

    - The user sends a message requesting information or an action that Gabby recognizes as requiring specialized expertise beyond her own (e.g., asking for deep analysis of Reality Spiral lore or specific tokenomics modeling).
    - Internally, Gabby's scope check and agent selection logic identifies this need and matches the query to a specialist agent (e.g., `SwarmLoreAgent` or `TokenomicsExpertAgent`).

3.  **Consultation Proposal:**

    - Gabby shifts the conversation flow and presents a clear proposal to the user within the chat.
    - **Example Message:** "I can provide some general thoughts on that, but my knowledge is limited. For a deeper analysis, I can consult with `TokenomicsExpertAgent` who specializes in this area. This consultation involves a fee of [X] $GABBY. Would you like me to proceed?"
    - **Interactive Buttons:** This message is accompanied by clear "Yes" and "No" buttons, allowing the user to easily indicate their decision.
    - _(Visual Aid Idea: Screenshot showing Gabby's proposal message with the Yes/No buttons clearly visible in the chat interface)._

4.  **User Decision & Payment (If "Yes"):**

    - If the user clicks "No", Gabby acknowledges the decision and either attempts a limited answer or states she cannot fully address the request. The chat continues in free mode.
    - If the user clicks "Yes":
      - Gabby sends a message confirming the choice and initiating the payment.
      - Gabby provides a link (e.g., to a Coinbase Commerce checkout page).
      - The user clicks the link, navigates away (or to a modal) to complete the payment using their connected wallet (e.g., Phantom).
      - _(Visual Aid Idea: Sequence showing the "Yes" click, Gabby providing the payment link, and potentially a placeholder/mockup of the external payment interface)._

5.  **Consultation Phase (Post-Payment):**

    - Upon successful payment confirmation (received by Gabby's backend via webhook):
      - Gabby sends a confirmation message to the user in the `user-chat-room` (e.g., "Payment received! I'll consult with the specialist now and get back to you.").
      - Gabby sends a signal to the frontend to **disable the user's chat input field**.
      - Gabby initiates the actual consultation with the specialist agent in the hidden `internal-consult` room.
      - _(Visual Aid Idea: Screenshot showing Gabby's confirmation message and the chat input field greyed out/disabled)._

6.  **Response Delivery & Completion:**
    - Once Gabby receives the necessary information from the specialist agent (and potentially performs synthesis in future versions):
      - Gabby delivers the final, synthesized response to the user in the `user-chat-room`.
      - Immediately after sending the response, Gabby sends a signal to the frontend to **re-enable the user's chat input field**.
      - The conversation can now continue normally.
    - _(Visual Aid Idea: Sequence showing Gabby's final response appearing, followed by the chat input field becoming active again)._

_(Video Aid Idea: A short screen recording demonstrating the entire flow from user query trigger through payment (mocked if necessary) to final response delivery and input re-enabling)._

This flow aims to be intuitive, clearly communicating the transition to a paid service and managing user expectations during the backend consultation process.

### 3.2 Consultation Triggering & Agent Selection (V1)

_Ticket: [Dev] Implement Consultation Relevance Check & Specialist Selection - https://github.com/Sifchain/sa-eliza/issues/421_
_ADR: Document V1 Agent Selection Mechanism - https://docs.google.com/document/d/1yDsMaGFLi94vJlNoI582xxkKw2sm2Uw2D8W-0njf9vM/edit?usp=sharing_

This component focuses on identifying opportunities to enhance Gabby's standard response. Instead of gating her ability to answer, this logic runs alongside her normal response generation. It analyzes the user's query to determine if it's highly relevant to the specific capabilities of a known V1 specialist agent (`SwarmLoreAgent` or `TokenomicsExpertAgent`).

If a strong relevance to a single specialist is detected, the ID of that specialist is identified. This identification is then used by the response composition step (part of User Proposal Generation) to decide whether to append the optional, paid consultation offer to Gabby's primary answer.

### 3.3 User Proposal & Consent

_Ticket: [Dev] Implement User Proposal Generation - https://github.com/Sifchain/sa-eliza/issues/422_
_Ticket: [Dev] Backend Button Support - https://linear.app/eliza-labs/issue/ELI2-246/[dev]-backend-button-support-define-and-implement-payload-standard_
_Ticket: [Dev - Frontend Coordination] Frontend Button Rendering - https://linear.app/eliza-labs/issue/ELI2-247/[dev-frontend-coordination]-frontend-button-rendering_

### 3.4 Consultation Execution (V1)

_Ticket: [Dev] Implement V1 Gabby Core & Specialist Agent Logic - https://github.com/Sifchain/sa-eliza/issues/418_

### 3.5 Handling User State During Consultation

### 3.6 Error Handling & Timeouts (V1)

### 3.7 Agent-to-Agent Communication Pattern

---

## 4. Core Feature Deep Dive: Payment Integration

### 4.1 Payment Flow Overview (User Confirmation -> Coinbase -> Webhook -> Confirmation)

### 4.2 Coinbase Commerce Integration Strategy

### 4.3 Implementation Details

### 4.4 Payment Flow Documentation

---

## 5. V1 Demo Setup & Presentation

### 5.1 Environment Requirements

### 5.2 Manual Setup Steps

### 5.3 UI Filtering Requirements

---

## 6. Future Considerations & Open Questions

### 6.1 Scalable Agent Discovery ("Rolodex")

### 6.2 Agent Reputation System

### 6.3 Advanced Consultation Flows (Multi-turn, Synthesis)

### 6.4 UX for Long-Running/Human Consultations

### 6.5 Payment Failures & Refunds

### 6.6 Alternative Agent Selection Mechanisms (Embeddings, Classifiers, etc.)

### 6.7 Direct Blockchain Interaction vs. Payment Processors

---

## 7. Appendices

### 7.1 Glossary

### 7.2 Related Documents & Links
