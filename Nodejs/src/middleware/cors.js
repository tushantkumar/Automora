import { CLIENT_ORIGIN } from "../config/constants.js";

export const corsMiddleware = (req, res, next) => {
  res.header("Access-Control-Allow-Origin", CLIENT_ORIGIN);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
};
