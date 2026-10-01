import React, { useState } from "react";
import { NavLink } from "react-router-dom";

import "./Navbar.css";

export default function NavbarAdmin() {
  const [open, setOpen] = useState(false);

  return (
    <nav>
      <NavLink to="/" className="header">
        <i className="fab fa-hive"></i> Admin
      </NavLink>

      <ul
        className="navbar-links"
        style={{ transform: open ? "translateX(0px)" : "" }}
      >
        <li>
          <NavLink to="/Verification" activeClassName="nav-active">
            Verification
          </NavLink>
        </li>

        <li>
          <NavLink to="/AddCandidate" activeClassName="nav-active">
            Add Candidate
          </NavLink>
        </li>

        <li>
          <NavLink to="/Registration" activeClassName="nav-active">
            <i className="far fa-registered" /> Registration
          </NavLink>
        </li>

        <li>
          <NavLink to="/Results" activeClassName="nav-active">
            <i className="fas fa-poll-h" /> Results
          </NavLink>
        </li>

        {/* ✅ New Report Menu at Last */}
        <li>
          <NavLink to="/Report" activeClassName="nav-active">
            <i className="fas fa-chart-bar" /> Report
          </NavLink>
        </li>
      </ul>

      <i
        onClick={() => setOpen(!open)}
        className="fas fa-bars burger-menu"
      ></i>
    </nav>
  );
}