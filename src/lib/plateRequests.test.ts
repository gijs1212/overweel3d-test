import { describe, expect, it } from "vitest";

import { isVisiblePlateRequest } from "./plateRequests";

const order = { id: "order-1", status: "in_progress" };
const printer = { id: "printer-1", current_file: "bloempot_plate_2.gcode.3mf" };
const job = {
  status: "suggested",
  order_id: order.id,
  printer_id: printer.id,
  expected_file_name: "Bloempot plate 2.3mf",
};

describe("plaatverzoeken op het admindashboard", () => {
  it("toont alleen een voorstel als het actuele printerbestand overeenkomt", () => {
    expect(isVisiblePlateRequest(job, [order], [printer])).toBe(true);
    expect(isVisiblePlateRequest(job, [order], [{ ...printer, current_file: "onbekend-model.gcode.3mf" }])).toBe(false);
  });

  it("verbergt verzoeken van voltooide bestellingen", () => {
    expect(isVisiblePlateRequest(job, [{ ...order, status: "completed" }], [printer])).toBe(false);
  });

  it("toont een eerder goedgekeurde run die door de oude werkwijze nog niet is geteld", () => {
    expect(isVisiblePlateRequest({ ...job, status: "printing" }, [order], [printer])).toBe(true);
    expect(isVisiblePlateRequest({ ...job, status: "printing", printer_id: null }, [order], [printer])).toBe(true);
    expect(isVisiblePlateRequest({ ...job, status: "printing", printer_id: null, observed_file_name: "bloempot_plate_2.gcode.3mf" }, [order], [{ ...printer, current_file: null }])).toBe(true);
  });
});
