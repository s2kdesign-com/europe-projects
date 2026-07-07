"use client";

import { useEffect, useState } from "react";
import Dashboard from "./components/Dashboard";

export default function Page() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed)
    return <Dashboard projects={[]} document