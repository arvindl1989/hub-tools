# KPI Tracker — Integration Guide

The KPI tracker (TicketIQ) is a React + Python FastAPI app that runs on Railway.
It cannot be hosted on Netlify (requires a Python server).

## One-repo setup

1. Copy all contents of `ticket-analytics2` into this `kpi-app/` folder
2. Replace `frontend/src/App.jsx` with the `App.jsx` file in this folder
3. In Railway, set the **Root Directory** to `kpi-app` in your service settings

## Railway environment variable

Add this env var in your Railway service:

```
VITE_HUB_URL=https://your-aegis-hub.netlify.app
```

This makes the "← Hub" back-link in TicketIQ point to the correct Netlify URL.
Set it after Netlify deployment is done.

## Hub homepage card

Once you have the Railway URL (e.g. `https://ticket-analytics2.up.railway.app`),
tell Claude Code and the KPI card on the hub homepage will be updated to link directly to it.
