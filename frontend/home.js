import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const HomePage = () => {
    const [selectedTail, setSelectedTail] = useState("All Aircrafts");
    const [tailNumbers, setTailNumbers] = useState([]);
    const [summary, setSummary] = useState({ total_logs: 0, total_faults: 0, total_events: 0 });
    const [uploadedFiles, setUploadedFiles] = useState(new Set());
    const [chatVisible, setChatVisible] = useState(false);
    const navigate = useNavigate();
    useEffect(() => {
        axios.get("http://localhost:5000/tailNumbers")
            .then(response => setTailNumbers(response.data.tailNumbers))
            .catch(error => console.error("Error fetching tail numbers:", error));

        axios.get("http://localhost:5000/summary")
            .then(response => {
                setSummary(response.data[selectedTail] || { total_logs: 0, total_faults: 0, total_events: 0 });
            })
            .catch(error => console.error("Error fetching summary data:", error));
    }, [selectedTail]);

    const handleUpload = async (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        const duplicateFiles = Array.from(files).filter(file => uploadedFiles.has(file.name));
        if (duplicateFiles.length > 0) {
            alert("You have already uploaded these logs: " + duplicateFiles.map(file => file.name).join(', '));
            return;
        }

        const formData = new FormData();
        for (const file of files) {
            formData.append("logFile", file);
            uploadedFiles.add(file.name); // Track uploaded file names
        }

        try {
            const response = await axios.post("http://localhost:5000/upload", formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            alert(response.data.message);
            window.location.reload(); // Refresh to update dropdown
        } catch (error) {
            alert("Upload failed!");
        }
    };
    const handleChatToggle = () => {
        setChatVisible(!chatVisible);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <header style={{ backgroundColor: '#f5f5f5', padding: '10px 0' }}>
                <nav className="navbar header">
                    <div className="container">
                        <div className="navbar-header">
                            <a className="navbar-brand">
                                <img src="/assets/14_._Logo.png" style={{ height: '40px' }} alt=". Logo" />
                            </a>
                        </div>
                    </div>
                </nav>
            </header>

            <main style={{ flex: '1', display: 'flex', justifyContent: 'space-between', margin: '20px' }}>
                {/* Summary Section */}
                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: '#e7f3fe', padding: '20px', borderRadius: '5px', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' }}>
                        <h2 style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '20px' }}>Logs Summary</h2>
                        <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '20px' }}>
                            {[{title: 'Total Logs Parsed', value: summary.total_logs, color: '#007bff'},
                              {title: 'Total Faults', value: summary.total_faults, color: '#dc3545'},
                              {title: 'Total Events', value: summary.total_events, color: '#28a745'}
                             ].map((item, index) => (
                                <div key={index} style={{ flex: 1, padding: '20px', border: '1px solid #ccc', borderRadius: '5px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '35px', fontWeight: '700', color: item.color }}>
                                        {item.value}
                                    </div>
                                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '20px' }}>
                                        {item.title}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <button className="btn" 
                        onClick={() => navigate(`/analytics/${selectedTail}`)} 
                        style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', width: '50%' }}>
                        Go to detailed log analysis →
                    </button>
                </div>

                {/* Filter Section */}
                <div style={{ width: '20%', padding: '20px', background: '#e7f3fe', borderRadius: '5px', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)', height: 'fit-content', marginLeft: '20px' }}>
                    <h3 style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '20px' }}>Filter by Aircraft</h3>
                    <select value={selectedTail} onChange={(e) => setSelectedTail(e.target.value)} style={{ width: '100%', padding: '10px', fontSize: '16px' }}>
                        <option key="All Aircrafts" value="All Aircrafts">All Aircrafts</option>
                        {tailNumbers.map((tail) => (
                            <option key={tail} value={tail}>{tail}</option>
                        ))}
                    </select>
                    <button style={{ marginTop: '20px', width: '100%', padding: '10px', background: '#007bff', color: 'white', border: 'none', borderRadius: '5px' }}>
                        <label htmlFor="file-upload" style={{ cursor: 'pointer', margin: '0', width: '100%', display: 'block', textAlign: 'center' }}>
                            Upload Logs
                        </label>
                        <input id="file-upload" type="file" accept=".zip" multiple onChange={handleUpload} style={{ display: "none" }} />
                    </button>
                </div>
            </main>

            <button style={{ position: 'fixed', bottom: '70px', right: '20px', height: '60px', width: '60px', borderRadius: '50%', backgroundColor: '#007bff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)', cursor: 'pointer' }} 
                    onClick={handleChatToggle}>
                     
            </button>

            <footer style={{ padding: "5px 0", fontSize: "12px", backgroundColor: "#333", color: 'white' }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <a href="http://www...com/terms-conditions" style={{ color: 'white', textDecoration: 'none' }}>Terms & Conditions</a>
                    <span style={{ margin: "0 5px" }}> | </span>
                    <a href="http://www...com/privacy-statement" style={{ color: 'white', textDecoration: 'none' }}>Privacy Statement</a>
                </div>
                <div style={{ textAlign: "center" }}>
                    <a href="http://www...com/" style={{ color: 'white', textDecoration: 'none' }}>© 2025 . International Inc.</a>
                </div>
            </footer>
        </div>
    );
};

export default HomePage;
