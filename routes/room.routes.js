import express from "express";
import { createRoom, getRoomInfo } from "../controllers/room.controller.js";

const router = express.Router();

router.post("/createroom", createRoom);
router.get("/rooms/:roomId", getRoomInfo);

export default router;
