// Each drawn machine type's symbol (symbols.jsx). The scene and the
// catalogue panel (issue #87) draw a machine through the same lookup, so a
// catalogue item shows the symbol it has on the canvas.
import {
  BinSymbol, MetalBinSymbol, ElevatorSymbol, DiverterSymbol,
  StubSymbol, FallbackSymbol,
  ConveyorSymbol, DrumFeederSymbol, ScreenSymbol, TreaterSymbol,
  SamplerSymbol, GrainBreakSymbol, IbcSymbol, MetalRemoverSymbol,
  ProBoxSymbol, VibratorySymbol, FillingHeadSymbol, RollerScaleSymbol,
  ScaleSymbol, FillerSymbol, PalletiserSymbol, ValveSymbol,
  GrainInSymbol, GrainOutSymbol,
} from "./symbols";

export const SYMBOLS = {
  bin: BinSymbol,
  metalBin: MetalBinSymbol,
  elevator: ElevatorSymbol,
  diverter: DiverterSymbol,
  stub: StubSymbol,
  conveyor: ConveyorSymbol,
  drumFeeder: DrumFeederSymbol,
  valve: ValveSymbol,
  screen: ScreenSymbol,
  treater: TreaterSymbol,
  sampler: SamplerSymbol,
  grainBreak: GrainBreakSymbol,
  ibc: IbcSymbol,
  metalRemover: MetalRemoverSymbol,
  proBox: ProBoxSymbol,
  vibratory: VibratorySymbol,
  fillingHead: FillingHeadSymbol,
  rollerScale: RollerScaleSymbol,
  scale: ScaleSymbol,
  filler: FillerSymbol,
  palletiser: PalletiserSymbol,
  grainIn: GrainInSymbol,
  grainOut: GrainOutSymbol,
};

export function symbolFor(type) {
  return SYMBOLS[type] ?? FallbackSymbol;
}
