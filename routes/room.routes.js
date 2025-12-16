import express from "express";
import { createRoom } from "../controllers/room.controller.js";

const router = express.Router();

router.post("/createroom", createRoom);

export default router;
