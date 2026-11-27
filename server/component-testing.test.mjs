import test from "node:test"
import assert from "node:assert/strict"
import { makeTruthInputs, circuitSignature, ComponentDocumentation, defaultDocumentation, TestGame, validBinary, summarizeDevelopmentResults } from "../simulator/src/CustomComponentTesting.ts"

test("truth table enumerates grouped inputs in binary order", () => {
    const ports = [{ id: "A", name: "A", bits: 2 }, { id: "B", name: "B", bits: 1 }]
    assert.deepEqual(Array.from({length:8}, (_,i) => makeTruthInputs(ports,i)), [
        ["00","0"],["00","1"],["01","0"],["01","1"],["10","0"],["10","1"],["11","0"],["11","1"],
    ])
})
test("signature ignores input value, reference, wire ordering and propagation delay", () => {
    const noDep = () => undefined
    const a = { components: { A: { type: "in", val: 0, ref: "A" }, G: { type: "gate", orient: "e" } }, wires: [[1,2],[3,4]] }
    const b = { components: { G: { orient: "e", type: "gate" }, A: { type: "in", val: 1 } }, wires: [[3,4,{propagationDelay:0}],[1,2]] }
    assert.equal(circuitSignature(a,noDep),circuitSignature(b,noDep))
    b.wires[0][1] = 5
    assert.notEqual(circuitSignature(a,noDep),circuitSignature(b,noDep))
})
test("a changed dependency invalidates a parent truth table", () => {
    const parent = { components: { X: { type: "custom-child" } } }
    const child = { components: { A: { type: "in", isConstant: true, val: 0 } } }
    const before = circuitSignature(parent, () => child)
    child.components.A.val = 1
    assert.notEqual(before,circuitSignature(parent, () => child))
})
test("documentation codec accepts saved independent test cases", () => {
    const doc = { ...defaultDocumentation(), cases: [{ id: "1", name: "carry", inputs: {A:"1"}, expected: {C:"0"} }] }
    assert.equal(ComponentDocumentation.decode(doc)._tag, "Right")
})

import { readFileSync } from "node:fs"
test("portable overflow example has eight valid independent cases", () => {
    const game = JSON.parse(readFileSync(new URL("../examples/overflow-addition.tests.json",import.meta.url),"utf8"))
    assert.equal(TestGame.decode(game)._tag,"Right")
    assert.equal(game.cases.length,8)
    for (const c of game.cases) {
        const {A,B,R}=c.inputs
        assert.ok([A,B,R,c.expected.V].every(v => validBinary(v,1)))
        assert.equal(c.expected.V, A === B && R !== A ? "1" : "0")
    }
    assert.equal(game.results,undefined)
})

import { resizeBus, isBusPinGroup, busConnectionMode } from "../simulator/src/BusBits.ts"
test("bus converter preserves LSB order, slices and extends", () => {
    assert.deepEqual(resizeBus([1,0,1,1],2,0,false,0),[1,0])
    assert.deepEqual(resizeBus([1,0,1,1],2,2,false,0),[1,1])
    assert.deepEqual(resizeBus([1,1],4,0,false,0),[1,1,0,0])
    assert.deepEqual(resizeBus([1,1],4,0,true,0),[1,1,1,1])
    assert.deepEqual(resizeBus([1,0],4,0,true,0),[1,0,0,0])
})

import { ExternalPinLayout } from "../simulator/src/ExternalPinLayout.ts"
test("external pins preserve legacy layouts and optional compact bus presentation", () => {
    const layout = [{id:"A",side:"w",bus:true},{id:"B",side:"w"},{id:"S",side:"e",bus:false}]
    const decoded = ExternalPinLayout.decode(layout)
    assert.equal(decoded._tag,"Right")
    assert.deepEqual(decoded.right,layout)
    assert.equal(ExternalPinLayout.decode([{id:"A",side:"w",bus:"yes"}])._tag,"Left")
})

test("development summary counts only current cases and handles pending, errors and empty suites", () => {
    const cases = ["a","b","c","d","e"].map(id => ({id}))
    const results = { a:{status:"pass"}, b:{status:"pass"}, c:{status:"fail"}, d:{status:"error"}, removed:{status:"fail"} }
    assert.deepEqual(summarizeDevelopmentResults(cases,results),{total:5,pass:2,fail:1,error:1,idle:1})
    delete results.c
    assert.deepEqual(summarizeDevelopmentResults(cases,results),{total:5,pass:2,fail:0,error:1,idle:2})
    assert.deepEqual(summarizeDevelopmentResults([],results),{total:0,pass:0,fail:0,error:0,idle:0})
})

test("changing an output to internal invalidates previously recorded component test results", () => {
    const circuit = { components: { Y: {type:"out",bits:1}, carry: {type:"out",bits:1} }, wires:[[1,2],[3,4]] }
    const before = circuitSignature(circuit,() => undefined)
    circuit.components.carry.isInternal = true
    assert.notEqual(circuitSignature(circuit,() => undefined),before)
})

test("gate operands are scalar pins, never a data bus", () => {
    assert.equal(isBusPinGroup("gate","In",2),false)
    assert.equal(isBusPinGroup("gate","In",8),false)
    assert.equal(isBusPinGroup("gate1","In",1),false)
    assert.equal(isBusPinGroup("bus-splitter","Bits",8),false)
    assert.equal(isBusPinGroup("bus-merger","Bus",8),true)
    assert.equal(isBusPinGroup("in","Out",8),true)
    assert.equal(isBusPinGroup("custom-au","A",8),true)
})
test("expanded groups allow scalar wiring but compact ports enforce bus widths", () => {
    const expanded = {width:8,compact:false}, compact = {width:8,compact:true}, narrow = {width:2,compact:false}
    assert.equal(busConnectionMode(expanded,undefined,false,true,true),"scalar")
    assert.equal(busConnectionMode(expanded,narrow,false,true,true),"scalar")
    assert.equal(busConnectionMode(expanded,expanded,false,true,false),"scalar")
    assert.equal(busConnectionMode(expanded,expanded,false,true,true),"bus")
    assert.equal(busConnectionMode(expanded,expanded,true,true,true),"scalar")
    assert.equal(busConnectionMode(compact,expanded,false,true,true),"bus")
    assert.equal(busConnectionMode(expanded,compact,true,true,true),"bus")
    assert.equal(busConnectionMode(compact,narrow,false,true,true),"width")
    assert.equal(busConnectionMode(compact,undefined,false,true,true),"width")
    assert.equal(busConnectionMode(compact,expanded,false,true,false),"occupied")
})

import { SymbolSize, minimumSymbolSize, snapSymbolSize, fitSymbolCaption } from "../simulator/src/ExternalPinLayout.ts"
test("symbol size snaps to integer grid and respects pin minimum", () => {
    const min=minimumSymbolSize(1,3)
    assert.deepEqual(min,{width:4,height:7})
    assert.deepEqual(snapSymbolSize({width:9.4,height:2},min),{width:9,height:7})
    assert.equal(SymbolSize.decode({width:6.5,height:8})._tag,"Left")
    assert.equal(SymbolSize.decode({width:8,height:8})._tag,"Right")
    assert.equal(fitSymbolCaption("Very long title",12,(s,f)=>s.length*f/2).text,"Ve…")
})

import { SymbolColor, resolveSymbolColor } from "../simulator/src/ExternalPinLayout.ts"
test("symbol color validates and distinguishes inheritance, neutral and explicit override", () => {
    assert.equal(SymbolColor.decode("#FF0088").right,"#ff0088")
    assert.equal(SymbolColor.decode("red")._tag,"Left")
    assert.equal(resolveSymbolColor("#ff0088",undefined),"#ff0088")
    assert.equal(resolveSymbolColor("#ff0088",null),undefined)
    assert.equal(resolveSymbolColor("#ff0088","#123456"),"#123456")
})
test("instance colors do not invalidate functional test results", () => {
    const circuit={components:{A:{type:"custom-adder"}},wires:[]}
    const colored={components:{A:{type:"custom-adder",colorOverride:"#123456"}},wires:[]}
    assert.equal(circuitSignature(circuit,()=>undefined),circuitSignature(colored,()=>undefined))
})
