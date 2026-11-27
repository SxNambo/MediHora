const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "db.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Capa de datos ----------
function leerDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    } catch {
        return { medicamentos: [], historial: [], sigId: 1 };
    }
}
function guardarDB(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ---------- Validaciones ----------
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function validarMedicamento(b) {
    const nombre = String(b.nombre || "").trim();
    const dosis = String(b.dosis || "").trim();
    const cadaHoras = Number(b.cadaHoras);
    if (!nombre) return "El nombre es obligatorio";
    if (!dosis) return "La dosis es obligatoria";
    if (!RE_HORA.test(b.horaInicio || "")) return "horaInicio debe tener formato HH:MM";
    if (!Number.isInteger(cadaHoras) || cadaHoras < 1 || cadaHoras > 24)
        return "cadaHoras debe ser un entero entre 1 y 24";
    return null;
}

// ---------- Medicamentos (CRUD) ----------
app.get("/api/medicamentos", (req, res) => {
    res.json(leerDB().medicamentos);
});

app.post("/api/medicamentos", (req, res) => {
    const error = validarMedicamento(req.body);
    if (error) return res.status(400).json({ error });
    const db = leerDB();
    const med = {
        id: db.sigId++,
        nombre: req.body.nombre.trim(),
        dosis: req.body.dosis.trim(),
        horaInicio: req.body.horaInicio,
        cadaHoras: Number(req.body.cadaHoras),
        notas: String(req.body.notas || "").trim()
    };
    db.medicamentos.push(med);
    guardarDB(db);
    res.status(201).json(med);
});

app.put("/api/medicamentos/:id", (req, res) => {
    const error = validarMedicamento(req.body);
    if (error) return res.status(400).json({ error });
    const db = leerDB();
    const med = db.medicamentos.find(m => m.id === Number(req.params.id));
    if (!med) return res.status(404).json({ error: "Medicamento no encontrado" });
    Object.assign(med, {
        nombre: req.body.nombre.trim(),
        dosis: req.body.dosis.trim(),
        horaInicio: req.body.horaInicio,
        cadaHoras: Number(req.body.cadaHoras),
        notas: String(req.body.notas || "").trim()
    });
    guardarDB(db);
    res.json(med);
});

app.delete("/api/medicamentos/:id", (req, res) => {
    const db = leerDB();
    const id = Number(req.params.id);
    if (!db.medicamentos.some(m => m.id === id))
        return res.status(404).json({ error: "Medicamento no encontrado" });
    db.medicamentos = db.medicamentos.filter(m => m.id !== id);
    guardarDB(db); // el historial se conserva como registro
    res.status(204).end();
});

// ---------- Historial de tomas ----------
// GET /api/historial?fecha=YYYY-MM-DD  (sin fecha devuelve todo)
app.get("/api/historial", (req, res) => {
    const { fecha } = req.query;
    if (fecha && !RE_FECHA.test(fecha))
        return res.status(400).json({ error: "fecha debe tener formato YYYY-MM-DD" });
    const h = leerDB().historial;
    res.json(fecha ? h.filter(r => r.fecha === fecha) : h);
});

app.post("/api/historial", (req, res) => {
    const { medicamentoId, fecha, programada, tomadaEn } = req.body;
    if (!RE_FECHA.test(fecha || "")) return res.status(400).json({ error: "fecha inválida" });
    if (!RE_HORA.test(programada || "")) return res.status(400).json({ error: "programada inválida" });
    if (!RE_HORA.test(tomadaEn || "")) return res.status(400).json({ error: "tomadaEn inválida" });

    const db = leerDB();
    const med = db.medicamentos.find(m => m.id === Number(medicamentoId));
    if (!med) return res.status(404).json({ error: "Medicamento no encontrado" });

    const repetido = db.historial.some(r =>
        r.medicamentoId === med.id && r.fecha === fecha && r.programada === programada);
    if (repetido) return res.status(409).json({ error: "Esa toma ya está registrada" });

    const registro = {
        id: db.sigId++,
        medicamentoId: med.id,
        nombre: med.nombre,
        dosis: med.dosis,
        fecha, programada, tomadaEn
    };
    db.historial.push(registro);
    guardarDB(db);
    res.status(201).json(registro);
});

app.delete("/api/historial/:id", (req, res) => {
    const db = leerDB();
    const id = Number(req.params.id);
    if (!db.historial.some(r => r.id === id))
        return res.status(404).json({ error: "Registro no encontrado" });
    db.historial = db.historial.filter(r => r.id !== id);
    guardarDB(db);
    res.status(204).end();
});

app.listen(PORT, () => console.log(`Servidor listo en http://localhost:${PORT}`));
