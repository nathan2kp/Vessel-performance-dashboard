import streamlit as st
import plotly.graph_objects as go
import numpy as np

# This is a reference for the logic, not directly executable in the React frontend.

# st.subheader("Speed Consumption Curve")
# col_left, col_chart, col_right = st.columns([1, 3, 2])

# with col_left:
#     wave_height = st.slider("Wave Height (m)", 0.0, 6.0, 1.25, 0.25)
#     wind_bf = st.slider("Wind (Beaufort Scale)", 0, 12, 4)
#     draft = st.slider("Draft (m)", 6.0, 14.0, 8.65, 0.1)
#     show_actual = st.checkbox("Show Actual Reported Points", value=True)
#     show_table = st.checkbox("Show Model Data Table", value=True)

# with col_chart:
speeds = np.linspace(5, 15, 50)
wave_height = 1.25 # Example value for analysis
wind_bf = 4 # Example value for analysis
time_period = "Last Month" # Example value for analysis

base_foc = 0.05 * speeds**3
k1, k2 = 0.03, 0.02
weather_factor = (k1 * wave_height + k2 * wind_bf)
adjusted_foc = base_foc * (1 + weather_factor)
foc_min = adjusted_foc * (1 - weather_factor)
foc_max = adjusted_foc * (1 + weather_factor)

period_map = {
    "Last 7 Days": 7,
    "Last Month": 30,
    "YTD": 180
}
num_points = period_map.get(time_period, 7)
rng = np.random.default_rng(seed=42)
actual_speeds = np.sort(rng.uniform(5.5, 14.5, num_points))
model_foc = 0.05 * actual_speeds ** 3 * (1 + 0.02)
std_dev = model_foc * 0.05
noise = rng.normal(0, std_dev)
outlier_indices = rng.choice(num_points, size=max(1, num_points // 10), replace=False)
noise[outlier_indices] += rng.choice([-1, 1], size=len(outlier_indices)) * model_foc[
    outlier_indices] * rng.uniform(0.1, 0.15, size=len(outlier_indices))
actual_foc = model_foc + noise

fig = go.Figure()
fig.add_trace(go.Scatter(x=speeds, y=foc_min, line=dict(width=0), showlegend=False, hoverinfo='skip'))
fig.add_trace(go.Scatter(
    x=speeds, y=foc_max,
    fill='tonexty',
    fillcolor='rgba(0, 255, 255, 0.3)',
    line=dict(width=0),
    name="Weather Effect Band",
    hoverinfo='skip'
))
fig.add_trace(go.Scatter(
    x=speeds, y=adjusted_foc,
    mode='lines',
    line=dict(color='cyan', width=3),
    name="Baseline FOC"
))
# if show_actual:
#     fig.add_trace(go.Scatter(
#         x=actual_speeds,
#         y=actual_foc,
#         mode='markers',
#         marker=dict(size=8, color='blue'),
#         name="Actual Reported FOC"
#     ))
fig.update_layout(
    xaxis_title="STW (Kts)",
    yaxis_title="FOC (MT/day)",
    hovermode="x unified",
    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
)
# st.plotly_chart(fig, use_container_width=True)
