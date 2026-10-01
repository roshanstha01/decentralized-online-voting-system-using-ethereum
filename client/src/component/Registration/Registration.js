// Node modules
import React, { Component } from "react";

// Components
import Navbar from "../Navbar/Navigation";
import NavbarAdmin from "../Navbar/NavigationAdmin";
import NotInit from "../NotInit";

// Contract
import getWeb3 from "../../getWeb3";
import Election from "../../contracts/Election.json";

// Excel reader
import * as XLSX from "xlsx";

// CSS
import "./Registration.css";

export default class Registration extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ElectionInstance: undefined,
      web3: null,
      account: null,
      isAdmin: false,
      isElStarted: false,
      isElEnded: false,

      voterCount: 0,
      voters: [],

      voterName: "",
      voterPhone: "",
      voterEmail: "",
      voterAge: "",
      voterGender: "",
      voterRegion: "",

      currentVoter: {
        address: undefined,
        name: "",
        phone: "",
        email: "",
        age: 0,
        gender: "",
        region: "",
        hasVoted: false,
        isVerified: false,
        isRegistered: false,
      },

      uploading: false,
      uploadMsg: "",
    };
  }

  componentDidMount = async () => {
    try {
      const web3 = await getWeb3();
      const accounts = await web3.eth.getAccounts();
      const networkId = await web3.eth.net.getId();
      const deployedNetwork = Election.networks[networkId];

      if (!deployedNetwork) {
        alert("Smart contract not deployed.");
        return;
      }

      const instance = new web3.eth.Contract(
        Election.abi,
        deployedNetwork.address
      );

      this.setState({
        web3,
        ElectionInstance: instance,
        account: accounts[0],
      });

      const admin = await instance.methods.admin().call();
      const isAdmin = accounts[0].toLowerCase() === admin.toLowerCase();
      this.setState({ isAdmin });

      const start = await instance.methods.start().call();
      const end = await instance.methods.end().call();
      this.setState({ isElStarted: start, isElEnded: end });

      const voterCount = await instance.methods.voterCount().call();
      this.setState({ voterCount: Number(voterCount) });

      const cv = await instance.methods.voterDetails(accounts[0]).call();

      this.setState({
        currentVoter: {
          address: cv.voterAddress,
          name: cv.name,
          phone: cv.phone,
          email: cv.email,
          age: Number(cv.age),
          gender: cv.gender,
          region: cv.region,
          hasVoted: cv.hasVoted,
          isVerified: cv.isVerified,
          isRegistered: cv.isRegistered,
        },
      });

      // Load voters for admin
      if (isAdmin) {
        const voters = [];
        for (let i = 0; i < Number(voterCount); i++) {
          const voterAddress = await instance.methods.voters(i).call();
          const v = await instance.methods.voterDetails(voterAddress).call();

          voters.push({
            address: v.voterAddress,
            name: v.name,
            phone: v.phone,
            email: v.email,
            age: Number(v.age),
            gender: v.gender,
            region: v.region,
            hasVoted: v.hasVoted,
            isVerified: v.isVerified,
            isRegistered: v.isRegistered,
          });
        }
        this.setState({ voters });
      }
    } catch (err) {
      console.error(err);
    }
  };

  handleChange = (key) => (e) => this.setState({ [key]: e.target.value });

  registerAsVoter = async (e) => {
    e.preventDefault();
    try {
      await this.state.ElectionInstance.methods
        .registerAsVoter(
          this.state.voterName,
          this.state.voterPhone,
          this.state.voterEmail,
          Number(this.state.voterAge),
          this.state.voterGender,
          this.state.voterRegion
        )
        .send({ from: this.state.account, gas: 1500000 });

      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Registration failed");
    }
  };

  /* ================= Excel Upload ================= */

  onExcelSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      this.setState({ uploading: true, uploadMsg: "Reading Excel..." });

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const workbook = XLSX.read(evt.target.result, { type: "binary" });
          const ws = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws);

          const addrs = rows.map((r) => r.address);
          const names = rows.map((r) => r.name);
          const phones = rows.map((r) => r.phone);
          const emails = rows.map((r) => r.email);
          const ages = rows.map((r) => r.age);
          const genders = rows.map((r) => r.gender);
          const regions = rows.map((r) => r.region);

          await this.state.ElectionInstance.methods
            .registerVotersBatch(addrs, names, phones, emails, ages, genders, regions)
            .send({
              from: this.state.account,
              gas: 5000000,
            });

          this.setState({
            uploading: false,
            uploadMsg: "Upload complete!",
          });

          window.location.reload();
        } catch (err2) {
          console.error(err2);
          this.setState({
            uploading: false,
            uploadMsg: "Upload failed.",
          });
        }
      };

      reader.readAsBinaryString(file);
    } catch (err) {
      console.error(err);
      this.setState({
        uploading: false,
        uploadMsg: "Upload failed.",
      });
    }
  };

  render() {
    if (!this.state.web3) {
      return (
        <>
          {this.state.isAdmin ? <NavbarAdmin /> : <Navbar />}
          <center>Loading...</center>
        </>
      );
    }

    // ✅ Allow voter registration before election
    // ✅ No NotInit blocking on Registration page
    const showNotInit = false;

    return (
      <>
        {this.state.isAdmin ? <NavbarAdmin /> : <Navbar />}

        {showNotInit ? (
          <NotInit />
        ) : (
          <>
            <div className="container-item info">
              <p>Total registered voters: {this.state.voterCount}</p>
            </div>

            {/* ================= ADMIN SECTION ================= */}
            {this.state.isAdmin && (
              <>
                <div className="container-main">
                  <h3>Upload Voters by Excel (.xlsx)</h3>
                  <div className="container-item">
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={this.onExcelSelected}
                    />
                    {this.state.uploadMsg && <p>{this.state.uploadMsg}</p>}
                  </div>
                </div>

                <div className="container-main" style={{ borderTop: "1px solid" }}>
                  <small>Total Voters: {this.state.voters.length}</small>
                  {loadAllVoters(this.state.voters)}
                </div>
              </>
            )}

            {/* ================= USER REGISTRATION ================= */}
            {!this.state.isAdmin && (
              <div className="container-main">
                <h3>Registration</h3>
                <div className="container-item">
                  <form onSubmit={this.registerAsVoter}>
                    <input
                      type="text"
                      placeholder="Name"
                      value={this.state.voterName}
                      onChange={this.handleChange("voterName")}
                      required
                    />
                    <input
                      type="text"
                      placeholder="Phone"
                      value={this.state.voterPhone}
                      onChange={this.handleChange("voterPhone")}
                      required
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={this.state.voterEmail}
                      onChange={this.handleChange("voterEmail")}
                      required
                    />
                    <input
                      type="number"
                      placeholder="Age"
                      value={this.state.voterAge}
                      onChange={this.handleChange("voterAge")}
                      required
                    />
                    <input
                      type="text"
                      placeholder="Gender"
                      value={this.state.voterGender}
                      onChange={this.handleChange("voterGender")}
                      required
                    />
                    <input
                      type="text"
                      placeholder="Region"
                      value={this.state.voterRegion}
                      onChange={this.handleChange("voterRegion")}
                      required
                    />
                    <button className="btn-add" type="submit">
                      Register
                    </button>
                  </form>
                </div>

                <div style={{ marginTop: "20px" }}>
                  {loadCurrentVoter(this.state.currentVoter)}
                </div>
              </div>
            )}
          </>
        )}
      </>
    );
  }
}

/* ================= Helper Views ================= */

export function loadCurrentVoter(voter) {
  if (!voter || !voter.address) return null;

  // ✅ Same design like screenshot
  return (
    <>
      <div className="container-item success">
        <center>Your Registered Info</center>
      </div>

      <div className="container-list success">
        <table>
          <tbody>
            <tr>
              <th>Account Address</th>
              <td>{voter.address}</td>
            </tr>
            <tr>
              <th>Name</th>
              <td>{voter.name}</td>
            </tr>
            <tr>
              <th>Phone</th>
              <td>{voter.phone}</td>
            </tr>
            <tr>
              <th>Voted</th>
              <td>{voter.hasVoted ? "True" : "False"}</td>
            </tr>
            <tr>
              <th>Verification</th>
              <td>{voter.isVerified ? "True" : "False"}</td>
            </tr>
            <tr>
              <th>Registered</th>
              <td>{voter.isRegistered ? "True" : "False"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

export function loadAllVoters(voters) {
  return (
    <>
      <div className="container-item success">
        <center>List of voters</center>
      </div>

      {voters.map((voter) => (
        <div className="container-list success" key={voter.address}>
          <table>
            <tbody>
              <tr>
                <th>Account address</th>
                <td>{voter.address}</td>
              </tr>
              <tr>
                <th>Name</th>
                <td>{voter.name}</td>
              </tr>
              <tr>
                <th>Phone</th>
                <td>{voter.phone}</td>
              </tr>
              <tr>
                <th>Email</th>
                <td>{voter.email}</td>
              </tr>
              <tr>
                <th>Age</th>
                <td>{voter.age}</td>
              </tr>
              <tr>
                <th>Gender</th>
                <td>{voter.gender}</td>
              </tr>
              <tr>
                <th>Region</th>
                <td>{voter.region}</td>
              </tr>
              <tr>
                <th>Voted</th>
                <td>{voter.hasVoted ? "True" : "False"}</td>
              </tr>
              <tr>
                <th>Verified</th>
                <td>{voter.isVerified ? "True" : "False"}</td>
              </tr>
              <tr>
                <th>Registered</th>
                <td>{voter.isRegistered ? "True" : "False"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}