"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function signUp() {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) alert(error.message);
    else alert("Signup successful. Check your email if confirmation is enabled.");
  }

  async function login() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) alert(error.message);
    else window.location.href = "/";
  }

  return (
    <main style={{ minHeight: "100vh", padding: 40, fontFamily: "Arial" }}>
      <h1>Login to Aplix</h1>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: "block", padding: 12, marginTop: 20, width: 300 }}
      />

      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: "block", padding: 12, marginTop: 12, width: 300 }}
      />

      <button onClick={signUp} style={{ padding: 12, marginTop: 20 }}>
        Sign Up
      </button>

      <button onClick={login} style={{ padding: 12, marginTop: 20, marginLeft: 10 }}>
        Login
      </button>
    </main>
  );
}
