// BKAV HaiHS : middleware xác thực token người dùng - start
const jwt = require("jsonwebtoken");
const { MESSAGES } = require("../constants/messages");

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: MESSAGES.AUTH.LOGIN_REQUIRED });
  }

  try {
    const SECRET_KEY = process.env.JWT_ACCESS_SECRET;
    const decoded = jwt.verify(token, SECRET_KEY);

    req.user = decoded;
    req.userId = decoded.id;

    next();
  } catch (error) {
    return res.status(401).json({ message: MESSAGES.AUTH.INVALID_TOKEN });
  }
};
// BKAV HaiHS : middleware xác thực token người dùng - end

module.exports = authMiddleware;
