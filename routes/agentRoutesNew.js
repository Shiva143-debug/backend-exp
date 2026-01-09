/**
 * Agent Routes
 * Routes for the intelligent agent endpoint
 * Uses AgentService to process user requests
 */

const express = require('express');
const AgentService = require('../services/agentService');

module.exports = function agentRoutes(ai, pool) {
  const router = express.Router();
  const agentService = new AgentService(ai, pool);

  /**
   * Auth Middleware
   */
  const ensureAuth = (req, res, next) => {
    const { userId, userName } = req.body;
    if (!userId) {
      return res.status(401).json({
        action: "reply",
        reply: "Authentication required. Please provide userId in request body."
      });
    }
    req.user = { id: userId, name: userName || "User" };
    next();
  };

  /**
   * Main Agent Endpoint
   * POST /agent
   * 
   * Body:
   * {
   *   "userId": 1,
   *   "userName": "John",
   *   "message": "What did I spend on food this month?"
   * }
   * 
   * Response:
   * {
   *   "action": "reply",
   *   "reply": "Your food expenses in December 2025: ₹5,000"
   * }
   */
  router.post("/agent", ensureAuth, async (req, res) => {
    try {
      const { message } = req.body;
      const userId = req.user.id;
      const userName = req.user.name;

      if (!message || !message.trim()) {
        return res.json({
          action: "reply",
          reply: "Please provide a message."
        });
      }

      console.log(`\n[Agent] New request from user ${userId}: "${message}"`);

      // Step 1: Get LLM's interpretation of user request
      const llmResponse = await agentService.processUserMessage(message, userId, userName);

      console.log(`[Agent] LLM Response action: ${llmResponse.action}`);

      // Step 2: Execute based on action type
      if (llmResponse.action === "reply") {
        // Simple text reply from LLM
        return res.json({
          action: "reply",
          reply: llmResponse.reply
        });
      }

      if (llmResponse.action === "need_data") {
        // User is asking for data - query and format response
        const { call, params } = llmResponse;
        console.log(`[Agent] need_data call: ${call}`);

        const result = await agentService.executeNeedData(call, params || {}, userId);

        return res.json({
          action: "reply",
          reply: result
        });
      }

      if (llmResponse.action === "addEntry") {
        // User wants to add entry - insert to database
        const { entry } = llmResponse;
        console.log(`[Agent] addEntry action`);

        const result = await agentService.executeAddEntry(entry, userId);

        return res.json({
          action: "reply",
          reply: result
        });
      }

      if (llmResponse.action === "updateEntry") {
        // User wants to update entry
        const { id, updates, type } = llmResponse;
        console.log(`[Agent] updateEntry action: id=${id}, type=${type}`);

        const result = await agentService.executeUpdateEntry(id, updates, userId, type);

        return res.json({
          action: "reply",
          reply: result
        });
      }

      if (llmResponse.action === "deleteEntry") {
        // User wants to delete entry
        const { id, type } = llmResponse;
        console.log(`[Agent] deleteEntry action: id=${id}, type=${type}`);

        const result = await agentService.executeDeleteEntry(id, userId, type);

        return res.json({
          action: "reply",
          reply: result
        });
      }

      if (llmResponse.action === "navigate") {
        // Navigation action - pass to frontend
        return res.json(llmResponse);
      }

      // Unknown action
      return res.json({
        action: "reply",
        reply: "Hi Welcome to Expense Tracker! How can I assist you today?"
      });

    } catch (err) {
      console.error("[Agent] Unhandled Error:", err);
      return res.status(500).json({
        action: "reply",
        reply: "Sorry, something went wrong. Please try again."
      });
    }
  });

  /**
   * Health Check Endpoint
   */
  router.get("/agent/health", (req, res) => {
    res.json({ status: "OK", message: "Agent service is running" });
  });

  return router;
};
