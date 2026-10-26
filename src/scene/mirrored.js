// Issue #155: true while Scene draws a flipped machine's symbol inside a
// mirror across the machine's centre (symbols.jsx reads it for text).
import { createContext } from "react";

export const MirroredContext = createContext(false);
