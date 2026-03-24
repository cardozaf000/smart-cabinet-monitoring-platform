/**
 * Portal.js
 * Monta sus hijos directamente en <body>, fuera de cualquier
 * stacking context, transform o elemento sticky que pueda interferir
 * con position:fixed e inset:0.
 */
import { createPortal } from "react-dom";
export default function Portal({ children }) {
  return createPortal(children, document.body);
}
