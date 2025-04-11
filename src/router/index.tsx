import { createBrowserRouter } from "react-router"
import Layout from "../Layout";
import Home from "@/pages/home/index.tsx";
export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Home />
      },
    ],
  },
]);
