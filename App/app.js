
const API = "/api";
let medicinas = [];
let historialHoy = [];
let alarmasActivas = false;
let audioCtx = null;
let sonidoTimer = null;
let alarmaActual = null;          
const avisadas = new Set();       
const pospuestas = new Map();    


const dos = n => String(n).padStart(2, "0");
const fechaLocal = (d = new Date()) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const horaLocal = (d = new Date()) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;
const aMinutos = hhmm => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const deMinutos = min => `${dos(Math.floor(min / 60) % 24)}:${dos(min % 60)}`;
const minutosAhora = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

// Genera las horas de toma de un día: inicio + k * cadaHoras (cíclico en 24 h)
function horariosDe(med) {
    const paso = med.cadaHoras * 60;
    const horas = new Set();
    for (let k = 0; k * paso < 1440; k++) horas.add((aMinutos(med.horaInicio) + k * paso) % 1440);
    return [...horas].sort((a, b) => a - b).map(deMinutos);
}


function el(tag, clase, texto) {
    const nodo = document.createElement(tag);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto; // textContent evita inyección de HTML
    return nodo;
}
function boton(texto, clase, onClick) {
    const b = el("button", clase, texto);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
}
function mensaje(texto) {
    const m = document.getElementById("mensaje");
    m.textContent = texto;
    m.classList.add("visible");
    setTimeout(() => m.classList.remove("visible"), 3000);
}


async function api(ruta, opciones = {}) {
    const resp = await fetch(API + ruta, {
        headers: { "Content-Type": "application/json" },
        ...opciones
    });
    if (resp.status === 204) return null;
    const datos = await resp.json();
    if (!resp.ok) throw new Error(datos.error || "Error en el servidor");
    return datos;
}

async function cargarMedicinas() { medicinas = await api("/medicamentos"); }
async function cargarHistorialHoy() { historialHoy = await api(`/historial?fecha=${fechaLocal()}`); }

function renderHoy() {
    const lista = document.getElementById("lista-hoy");
    lista.replaceChildren();

    const tomas = [];
    medicinas.forEach(med => horariosDe(med).forEach(h => tomas.push({ med, programada: h })));
    tomas.sort((a, b) => a.programada.localeCompare(b.programada));

    if (tomas.length === 0) {
        lista.append(el("li", "vacio", "Aún no hay medicinas. Ve a «Mis medicinas» para agregar la primera."));
        return;
    }

    const ahora = minutosAhora();
    tomas.forEach(({ med, programada }) => {
        const registro = historialHoy.find(r => r.medicamentoId === med.id && r.programada === programada);
        const estado = registro ? "tomada" : (aMinutos(programada) < ahora ? "atrasada" : "pendiente");

        const li = el("li", `item ${estado}`);
        li.append(el("p", "hora", programada), el("p", "nombre", med.nombre), el("p", "detalle", `Dosis: ${med.dosis}`));
        if (med.notas) li.append(el("p", "detalle", med.notas));

        const textoEstado = { tomada: `✔ Tomada a las ${registro && registro.tomadaEn}`, atrasada: "Pendiente: ya pasó la hora", pendiente: "Próxima toma" }[estado];
        li.append(el("p", "estado", textoEstado));

        if (!registro) {
            const acciones = el("div", "acciones");
            acciones.append(boton("Ya la tomé", "", () => registrarToma(med, programada)));
            li.append(acciones);
        }
        lista.append(li);
    });
}

async function registrarToma(med, programada) {
    try {
        await api("/historial", {
            method: "POST",
            body: JSON.stringify({ medicamentoId: med.id, fecha: fechaLocal(), programada, tomadaEn: horaLocal() })
        });
        await cargarHistorialHoy();
        renderHoy();
        mensaje(`Registrado: ${med.nombre}`);
    } catch (e) { mensaje(e.message); }
}

function renderMedicinas() {
    const lista = document.getElementById("lista-medicinas");
    lista.replaceChildren();
    if (medicinas.length === 0) {
        lista.append(el("li", "vacio", "No hay medicinas guardadas."));
        return;
    }
    medicinas.forEach(med => {
        const li = el("li", "item pendiente");
        li.append(
            el("p", "nombre", med.nombre),
            el("p", "detalle", `Dosis: ${med.dosis}`),
            el("p", "detalle", `Cada ${med.cadaHoras} h, desde las ${med.horaInicio}`),
            el("p", "detalle", `Horas del día: ${horariosDe(med).join(", ")}`)
        );
        if (med.notas) li.append(el("p", "detalle", med.notas));
        const acciones = el("div", "acciones");
        acciones.append(
            boton("Editar", "secundario", () => editarMedicina(med)),
            boton("Eliminar", "peligro", () => eliminarMedicina(med))
        );
        li.append(acciones);
        lista.append(li);
    });
}

const form = document.getElementById("form-med");
const campo = id => document.getElementById(id);

form.addEventListener("submit", async evento => {
    evento.preventDefault();
    const id = campo("med-id").value;
    const cuerpo = JSON.stringify({
        nombre: campo("med-nombre").value,
        dosis: campo("med-dosis").value,
        horaInicio: campo("med-hora").value,
        cadaHoras: Number(campo("med-cada").value),
        notas: campo("med-notas").value
    });
    try {
        await api(id ? `/medicamentos/${id}` : "/medicamentos", { method: id ? "PUT" : "POST", body: cuerpo });
        limpiarFormulario();
        await cargarMedicinas();
        renderMedicinas();
        renderHoy();
        mensaje("Medicina guardada");
    } catch (e) { mensaje(e.message); }
});

function editarMedicina(med) {
    campo("med-id").value = med.id;
    campo("med-nombre").value = med.nombre;
    campo("med-dosis").value = med.dosis;
    campo("med-hora").value = med.horaInicio;
    campo("med-cada").value = med.cadaHoras;
    campo("med-notas").value = med.notas;
    campo("btn-guardar").textContent = "Guardar cambios";
    campo("btn-cancelar").hidden = false;
    form.scrollIntoView({ behavior: "smooth" });
}

function limpiarFormulario() {
    form.reset();
    campo("med-id").value = "";
    campo("med-cada").value = 8;
    campo("btn-guardar").textContent = "Guardar medicina";
    campo("btn-cancelar").hidden = true;
}
campo("btn-cancelar").addEventListener("click", limpiarFormulario);

async function eliminarMedicina(med) {
    if (!confirm(`¿Eliminar ${med.nombre}? Sus alarmas dejarán de sonar.`)) return;
    try {
        await api(`/medicamentos/${med.id}`, { method: "DELETE" });
        await cargarMedicinas();
        renderMedicinas();
        renderHoy();
        mensaje("Medicina eliminada");
    } catch (e) { mensaje(e.message); }
}


async function renderHistorial() {
    const lista = document.getElementById("lista-historial");
    const fecha = campo("hist-fecha").value || fechaLocal();
    lista.replaceChildren();
    try {
        const registros = await api(`/historial?fecha=${fecha}`);
        if (registros.length === 0) {
            lista.append(el("li", "vacio", "No hay tomas registradas ese día."));
            return;
        }
        registros.sort((a, b) => a.tomadaEn.localeCompare(b.tomadaEn)).forEach(r => {
            const li = el("li", "item tomada");
            li.append(
                el("p", "nombre", `${r.nombre} · ${r.dosis}`),
                el("p", "detalle", `Tomada a las ${r.tomadaEn} (estaba programada a las ${r.programada})`)
            );
            const acciones = el("div", "acciones");
            acciones.append(boton("Deshacer registro", "peligro", async () => {
                try {
                    await api(`/historial/${r.id}`, { method: "DELETE" });
                    await cargarHistorialHoy();
                    renderHistorial();
                    renderHoy();
                } catch (e) { mensaje(e.message); }
            }));
            li.append(acciones);
            lista.append(li);
        });
    } catch (e) { mensaje(e.message); }
}
campo("hist-fecha").addEventListener("change", renderHistorial);

// ---------- Alarmas ----------
campo("btn-alarmas").addEventListener("click", async () => {
    // El navegador exige un toque del usuario para permitir sonido
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
    }
    alarmasActivas = true;
    campo("btn-alarmas").textContent = "✔ Alarmas activadas";
    campo("btn-alarmas").classList.add("activa");
    pitido();
});

function pitido() {
    if (!audioCtx) return;
    [0, 0.35].forEach(retraso => {
        const osc = audioCtx.createOscillator();
        const vol = audioCtx.createGain();
        osc.frequency.value = 880;
        vol.gain.setValueAtTime(0.4, audioCtx.currentTime + retraso);
        vol.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + retraso + 0.25);
        osc.connect(vol).connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + retraso);
        osc.stop(audioCtx.currentTime + retraso + 0.3);
    });
}

function dispararAlarma(med, programada, clave) {
    alarmaActual = { med, programada, clave };
    campo("alarma-nombre").textContent = med.nombre;
    campo("alarma-dosis").textContent = `${med.dosis} (programada ${programada})`;
    campo("alarma").hidden = false;
    pitido();
    sonidoTimer = setInterval(() => { pitido(); if (navigator.vibrate) navigator.vibrate([400, 200, 400]); }, 2000);
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
        new Notification("Hora de tu medicina", { body: `${med.nombre} - ${med.dosis}` });
    }
}

function cerrarAlarma() {
    clearInterval(sonidoTimer);
    campo("alarma").hidden = true;
    alarmaActual = null;
}

campo("alarma-tomada").addEventListener("click", async () => {
    const { med, programada } = alarmaActual;
    cerrarAlarma();
    await registrarToma(med, programada);
});
campo("alarma-posponer").addEventListener("click", () => {
    pospuestas.set(alarmaActual.clave, minutosAhora() + 10);
    cerrarAlarma();
});

// Revisa cada 5 segundos contra el reloj del dispositivo
function revisarAlarmas() {
    if (!alarmasActivas || alarmaActual) return;
    const ahora = minutosAhora();
    const hoy = fechaLocal();
    for (const med of medicinas) {
        for (const programada of horariosDe(med)) {
            const clave = `${hoy}|${med.id}|${programada}`;
            const yaTomada = historialHoy.some(r => r.medicamentoId === med.id && r.programada === programada);
            if (yaTomada) continue;

            const diferencia = ahora - aMinutos(programada);
            const tocaPrimera = !avisadas.has(clave) && diferencia >= 0 && diferencia <= 60;
            const tocaPosponida = pospuestas.has(clave) && ahora >= pospuestas.get(clave);
            if (tocaPrimera || tocaPosponida) {
                avisadas.add(clave);
                pospuestas.delete(clave);
                dispararAlarma(med, programada, clave);
                return;
            }
        }
    }
}

// ---------- Reloj y arranque ----------
function actualizarReloj() {
    const d = new Date();
    campo("reloj").textContent = `${horaLocal(d)}`;
    campo("fecha-hoy").textContent = d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
}

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("activa", t === tab));
    ["hoy", "medicinas", "historial"].forEach(v => { campo(`vista-${v}`).hidden = v !== tab.dataset.vista; });
    if (tab.dataset.vista === "historial") renderHistorial();
}));

async function iniciar() {
    campo("hist-fecha").value = fechaLocal();
    actualizarReloj();
    setInterval(actualizarReloj, 1000);
    try {
        await Promise.all([cargarMedicinas(), cargarHistorialHoy()]);
        renderHoy();
        renderMedicinas();
    } catch (e) { mensaje("No se pudo conectar con el servidor"); }
    setInterval(revisarAlarmas, 5000);
    setInterval(renderHoy, 60000); // refresca estados (pendiente → atrasada)
}
iniciar();
