'use client';
import TownLandscape from './TownLandscape';
import TownBuildings from './kit/TownBuildings';
import Ocean from './Ocean';
import Pier from './Pier';
import ConceptLandmarks from './ConceptLandmarks';
import Downtown from './Downtown';
import SkatePark from './SkatePark';
import SkiMountain from './SkiMountain';
import Beach from './Beach';
import SeaCave from './SeaCave';
import LighthouseTower from './LighthouseTower';
import type {WorldRuntimeState} from '../runtime/types';
/** Existing sphere runtime, authored town composition; no scene transition for interiors. */
export default function Environment({runtime}:{runtime:WorldRuntimeState}){
 return <group><TownLandscape runtime={runtime}/><Ocean/><TownBuildings runtime={runtime}/><Pier/><ConceptLandmarks/><SeaCave/><LighthouseTower reduced={runtime.reducedMotion}/><Downtown/><Beach runtime={runtime}/><SkatePark/><SkiMountain/></group>;
}
